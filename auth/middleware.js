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
 * Route guards. Two access tiers:
 *   - viewer:    any SSO-verified DU person - a valid session cookie is enough
 *   - dashboard: viewer + an active tbl_users row; role checked per request
 *
 * The user row is looked up DB-fresh on every dashboard request, so a
 * deactivation or role change bites immediately, not at token expiry.
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
 * sign-in helps (a fetch cannot follow it to the identity provider). Browsers
 * mark a navigation with Sec-Fetch-Mode: navigate; a client without the
 * header is told apart by whether it asked for HTML by name.
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
 * 403 and 500 answer through libs/refuse.js, in the caller's shape.
 *
 * The guards are named functions carrying `tier`/`roles` metadata: the
 * inventory test in tests/integration/rbac_routes.test.js reads the
 * protection on each route off the router stack. Keep both.
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

            /* a state change must come from the dashboard (the second lock beside SameSite=Lax); before the database lookup */
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
