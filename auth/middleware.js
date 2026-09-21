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

/*
 * Route guards. Two access tiers (mirrors v1 behavior, minus its holes):
 *   - viewer:    any SSO-verified DU person - a valid session cookie is enough
 *   - dashboard: viewer + an active tbl_users row; role checked per request
 *
 * The user row is looked up DB-fresh on every dashboard request (same policy
 * as repo-backend-v2 RBAC) so deactivation/role changes bite immediately
 * instead of at token expiry.
 */

const CONFIG = require('../config/config');
const JWT = require('../libs/jwt');
const MODEL = require('./model');
const LOGGER = require('../libs/log4');
const { refuse, is_htmx } = require('../libs/refuse');
const { same_origin } = require('../libs/origin');

/* methods that read; anything else changes state and must come from our own page */
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * True when the client is a browser navigating - the one caller a redirect to
 * sign-in helps. A page's own fetch() or XHR carries the same cookie but
 * cannot follow that redirect: it ends at the identity provider, another
 * origin, so the fetch dies as a CORS failure and pdf.js showed "an error
 * occurred" for a session that expired while the viewer was open. Browsers
 * mark a navigation with Sec-Fetch-Mode: navigate; a client without the
 * header is told apart by whether it asked for HTML by name (a navigation's
 * Accept lists text/html; fetch's default accepts anything).
 * @param req
 */
function is_navigation(req) {

    const mode = req.get('sec-fetch-mode');

    if (mode !== undefined) {
        return mode === 'navigate';
    }

    return /\btext\/html\b/.test(req.get('accept') || '');
}

/**
 * True when a redirect to sign-in is the right answer: a browser navigating
 * with GET, and not an htmx request (those get HX-Redirect instead)
 * @param req
 */
function wants_html_redirect(req) {
    return req.method === 'GET' && req.get('hx-request') === undefined && is_navigation(req);
}

function deny(req, res) {

    if (wants_html_redirect(req)) {
        const next = encodeURIComponent(req.originalUrl);
        res.redirect(`${CONFIG.app_path}/login?next=${next}`);
        return;
    }

    /*
     * HTMX: a full-page redirect beats swapping a login page into a fragment.
     * Reswap none so nothing lands in the target while the browser navigates.
     */
    if (is_htmx(req)) {
        res.set('HX-Redirect', `${CONFIG.app_path}/login`);
        res.set('HX-Reswap', 'none');
        res.status(401).end();
        return;
    }

    res.status(401).send({message: 'Unauthorized'});
}

/*
 * 403 and 500 answer through libs/refuse.js, in the caller's shape - the same
 * helper the rate limiter uses, so every refusal in the app looks the same.
 */

/*
 * The guards below are named functions carrying `tier`/`roles` metadata. That
 * makes the protection on each route readable from the router stack, so the
 * inventory test in tests/integration/rbac_routes.test.js can assert what
 * guards which route rather than inferring it - a new route added without a
 * guard fails the build instead of shipping open.
 */

/**
 * Requires a valid session cookie (viewer tier)
 */
exports.require_viewer = function require_viewer(req, res, next) {

    try {
        const token = JWT.extract(req);

        if (token === null) {
            deny(req, res);
            return;
        }

        req.session = JWT.verify(token);
        next();

    } catch {
        deny(req, res);
    }
};

/**
 * Requires a valid session cookie AND an active tbl_users row.
 * Pass roles to restrict further, e.g. require_dashboard('admin').
 * @param roles allowed roles; empty = any active dashboard user
 */
exports.require_dashboard = function (...roles) {

    function require_dashboard_guard(req, res, next) {

        (async function () {

            let session;

            try {
                const token = JWT.extract(req);

                if (token === null) {
                    deny(req, res);
                    return;
                }

                session = JWT.verify(token);

            } catch {
                deny(req, res);
                return;
            }

            /*
             * Every dashboard change must come from the dashboard: a second
             * lock beside the cookie's SameSite=Lax, so the CSRF defence does
             * not rest on one cookie attribute. Before the database lookup -
             * a refused request costs nothing.
             */
            if (!SAFE_METHODS.has(req.method) && !same_origin(req)) {
                refuse(req, res, 403, 'This request did not come from the PDF Bookshelf page, so it was not carried out.');
                return;
            }

            try {
                const user = await MODEL.find_active_user(session.sub);

                if (user === undefined) {
                    refuse(req, res, 403, 'You do not have access to the dashboard.');
                    return;
                }

                if (roles.length > 0 && !roles.includes(user.role)) {
                    refuse(req, res, 403, 'You do not have permission to perform this action.');
                    return;
                }

                req.session = session;
                req.user = user;
                next();

            } catch (error) {
                LOGGER.module().error('ERROR: [/auth/middleware (require_dashboard)] ' + error.message);
                refuse(req, res, 500, 'An unexpected error occurred.');
            }

        })();
    }

    require_dashboard_guard.tier = 'dashboard';
    require_dashboard_guard.roles = roles;

    return require_dashboard_guard;
};

exports.require_viewer.tier = 'viewer';
exports.require_viewer.roles = [];
