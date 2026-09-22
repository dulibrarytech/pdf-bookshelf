/**
 * Copyright 2026 University of Denver
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

'use strict';

const HTTP = require('http');
const EXPRESS = require('express');
const COMPRESS = require('compression');
const COOKIE_PARSER = require('cookie-parser');
const HELMET = require('helmet');
const CONFIG = require('./config');
const LOGGER = require('../libs/log4');
const PDFJS = require('../libs/pdfjs');
const { refuse } = require('../libs/refuse');
const { describe_error } = require('../libs/errors');
const { describe_listen_error } = require('./validate');


/**
 * form-action sources: this origin, plus the identity provider's when signing
 * out ends there. Chromium applies form-action to the redirect a form
 * submission is answered with, so without that origin the sign-out button's
 * 303 to SSO_LOGOUT_URL is refused and the page simply stays put - while
 * curl, Firefox and the integration suite all see the redirect go through.
 * @param logout_url CONFIG.sso_logout_url, possibly unset
 * @returns {string[]}
 */
function form_action_sources(logout_url) {

    const sources = ["'self'"];

    if (logout_url) {
        try {
            sources.push(new URL(logout_url).origin);
        } catch {
            /* not a URL: sign-out could not get there anyway, so nothing to allow */
        }
    }

    return sources;
}

module.exports = function () {

    const APP = EXPRESS();
    const SERVER = HTTP.createServer(APP);

    APP.set('views', './views');
    APP.set('view engine', 'ejs');
    /* app-wide view locals - every res.render sees these without threading */
    APP.locals.app_path = CONFIG.app_path;
    APP.locals.appname = CONFIG.app_name;
    APP.locals.appversion = CONFIG.app_version;
    APP.locals.organization = CONFIG.organization;
    APP.locals.asset_v = CONFIG.asset_v;
    /*
     * the pdf.js bundle's own version keys the viewer's URLs, so an upgrade
     * reaches returning browsers at once instead of after the day-long static
     * cache ages out - see libs/pdfjs.js
     */
    APP.locals.pdfjs_v = PDFJS.version();
    APP.set('view cache', process.env.NODE_ENV === 'production');
    APP.disable('x-powered-by');
    /*
     * Which upstream proxies may set X-Forwarded-For. req.ip - and with it
     * every per-address rate limit - is only as right as this: trust the
     * wrong hop and every user behind nginx shares one bucket, so a busy
     * class period rate-limits the whole campus. Defaults to loopback, the
     * documented topology (nginx on this host); TRUST_PROXY names the TLS
     * terminator when it lives elsewhere. Validated at boot.
     */
    APP.set('trust proxy', CONFIG.trust_proxy);

    if (process.env.NODE_ENV === 'production') {
        APP.use(COMPRESS());
    }

    APP.use(HELMET({
        contentSecurityPolicy: {
            directives: {
                defaultSrc: ["'self'"],
                /*
                 * NOTE the absence of 'unsafe-eval'. pdf.js feature-tests
                 * `new Function("")` and takes a slower non-eval path when CSP
                 * blocks it; that is the layer which made CVE-2024-4367
                 * unexploitable here while the viewer was still on 2.8.335.
                 * Keep it out even though the viewer is now patched.
                 * 'wasm-unsafe-eval' permits WebAssembly ONLY - pdf.js 6 uses
                 * it for JPEG 2000 images and ICC colour profiles - and does
                 * not re-enable eval/Function.
                 */
                scriptSrc: ["'self'", "'wasm-unsafe-eval'"],
                /* style ATTRIBUTES only (Bootstrap-idiomatic); scripts stay self-only */
                styleSrc: ["'self'", "'unsafe-inline'"],
                /* pdf.js paints page images from blob: canvases */
                imgSrc: ["'self'", 'data:', 'blob:'],
                /* fonts embedded in a PDF are handed to the browser as data: URLs */
                fontSrc: ["'self'", 'data:'],
                objectSrc: ["'none'"],
                frameAncestors: ["'self'"],
                /*
                 * where a form may send its data, and - in Chromium - where
                 * the answer to a form submission may redirect: the sign-out
                 * button's 303 to the identity provider needs its origin
                 * here (found by the e2e suite; see form_action_sources)
                 */
                formAction: form_action_sources(CONFIG.sso_logout_url),
                /* pdf.js renders pages in workers from blob: URLs */
                workerSrc: ["'self'", 'blob:'],
                /*
                 * helmet's default CSP adds upgrade-insecure-requests, which
                 * makes browsers rewrite redirect hops to https - that breaks
                 * the filename->uuid 301 under plain-http dev. Keep it only in
                 * production, where nginx terminates TLS anyway.
                 */
                upgradeInsecureRequests: process.env.NODE_ENV === 'production' ? [] : null
            }
        },
        crossOriginEmbedderPolicy: false
    }));

    /*
     * Nothing here is for an index: every page is behind sign-in and the
     * PDFs are licensed. robots.txt at the domain root says so to crawlers
     * that ask; this header says it on every answer, including to one that
     * arrives some other way.
     */
    APP.use(function (req, res, next) {
        res.set('X-Robots-Tag', 'noindex, nofollow');
        next();
    });

    APP.use(EXPRESS.json({limit: '1mb'}));
    APP.use(EXPRESS.urlencoded({extended: true, limit: '1mb'}));
    APP.use(COOKIE_PARSER());

    APP.use(CONFIG.app_path + '/static', EXPRESS.static('./public', {
        maxAge: process.env.NODE_ENV === 'production' ? '1d' : 0
    }));

    require('../auth/routes')(APP);
    require('../pdfs/routes')(APP);
    require('../dashboard/routes')(APP);
    require('../users/routes')(APP);
    require('../uploads/routes')(APP);
    require('../utils/routes')(APP);

    /* in the caller's shape: a page for a browser, headers and a toast for htmx, JSON otherwise */
    APP.use(function (req, res) {
        refuse(req, res, 404, 'Resource not found.');
    });

    /*
     * Central error handler: whatever a route did not answer itself. Mapped
     * by libs/errors.describe_error() - a typed refusal or a parser's client
     * error keeps its status, anything else is a 500 with a generic line -
     * and answered in the caller's shape, so an htmx action sees a toast
     * rather than nothing (it used to get a full page, which htmx ignores)
     * and a browser sees the error page. Never hangs, never leaks internals.
     */
    APP.use(function (error, req, res, next) {

        if (res.headersSent) {
            /* mid-stream: only Express's default handler can still close the connection */
            next(error);
            return;
        }

        const { status, message, expected } = describe_error(error);

        if (expected) {
            LOGGER.module().warn(`[/config/express (error handler)] ${status} ${error.message}`);
        } else {
            LOGGER.module().error('ERROR: [/config/express (error handler)] ' + error.message);
        }

        refuse(req, res, status, message);
    });

    /*
     * Nothing else the app does matters if it cannot listen. Say what is
     * wrong in one line and stop - console.error rather than the logger,
     * for the reason config/validate.js gives: log4js buffers its file
     * appender and exit does not wait for the flush.
     */
    SERVER.on('error', function (error) {
        console.error(`\n${CONFIG.app_name} cannot start - ${describe_listen_error(error, CONFIG.app_port)}\n`);
        process.exit(1);
    });

    /* "running" only once it is: the entrypoint used to log this before the port was bound */
    SERVER.on('listening', function () {
        LOGGER.module().info(`${CONFIG.app_name} ${CONFIG.app_version} running at http://${CONFIG.app_host}:${SERVER.address().port}${CONFIG.app_path} in ${CONFIG.node_env} mode.`);
    });

    SERVER.listen(CONFIG.app_port);

    /*
     * exposed so a caller can close it - the RBAC route tests boot the real
     * app on an ephemeral port (APP_PORT=0) and shut it down afterwards
     */
    APP.server = SERVER;

    return APP;
};

/* exported for tests */
module.exports._form_action_sources = form_action_sources;
