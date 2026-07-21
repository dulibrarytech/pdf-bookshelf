/**

 Copyright 2026 University of Denver

 Licensed under the Apache License, Version 2.0 (the "License");
 you may not use this file except in compliance with the License.
 You may obtain a copy of the License at

 http://www.apache.org/licenses/LICENSE-2.0

 Unless required by applicable law or agreed to in writing, software
 distributed under the License is distributed on an "AS IS" BASIS,
 WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 See the License for the specific language governing permissions and
 limitations under the License.

 */

'use strict';

const HTTP = require('http');
const EXPRESS = require('express');
const COMPRESS = require('compression');
const COOKIE_PARSER = require('cookie-parser');
const HELMET = require('helmet');
const CONFIG = require('./config');
const LOGGER = require('../libs/log4');

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
    APP.set('view cache', process.env.NODE_ENV === 'production');
    APP.disable('x-powered-by');
    /* nginx terminates TLS in front of the app; keep req.ip honest for rate limits */
    APP.set('trust proxy', 'loopback');

    if (process.env.NODE_ENV === 'production') {
        APP.use(COMPRESS());
    }

    APP.use(HELMET({
        contentSecurityPolicy: {
            directives: {
                defaultSrc: ["'self'"],
                scriptSrc: ["'self'"],
                /* style ATTRIBUTES only (Bootstrap-idiomatic); scripts stay self-only */
                styleSrc: ["'self'", "'unsafe-inline'"],
                imgSrc: ["'self'", 'data:'],
                fontSrc: ["'self'"],
                objectSrc: ["'none'"],
                frameAncestors: ["'self'"],
                /* pdf.js (phase 3) renders pages in workers from blob: URLs */
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

    APP.use(function (req, res) {
        res.status(404).render('error', {
            message: 'Resource not found.'
        });
    });

    /* central error handler - answer the request, never hang or leak internals */
    APP.use(function (error, req, res, next) {
        LOGGER.module().error('ERROR: [/config/express (error handler)] ' + error.message);
        res.status(500).render('error', {
            message: 'An unexpected error occurred.'
        });
    });

    SERVER.listen(CONFIG.app_port);

    return APP;
};
