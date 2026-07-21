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

/**
 * True when the client expects a full HTML page (vs an HTMX fragment/API call)
 * @param req
 */
function wants_html_redirect(req) {
    return req.method === 'GET' && req.get('hx-request') === undefined && (req.accepts(['html', 'json']) === 'html');
}

function deny(req, res) {

    if (wants_html_redirect(req)) {
        const next = encodeURIComponent(req.originalUrl);
        res.redirect(`${CONFIG.app_path}/login?next=${next}`);
        return;
    }

    /* HTMX: a full-page redirect beats swapping a login page into a fragment */
    if (req.get('hx-request') !== undefined) {
        res.set('HX-Redirect', `${CONFIG.app_path}/login`);
        res.status(401).send('Session expired.');
        return;
    }

    res.status(401).send({message: 'Unauthorized'});
}

/**
 * Requires a valid session cookie (viewer tier)
 */
exports.require_viewer = function (req, res, next) {

    try {
        const token = JWT.extract(req);

        if (token === null) {
            deny(req, res);
            return;
        }

        req.session = JWT.verify(token);
        next();

    } catch (error) {
        deny(req, res);
    }
};

/**
 * Requires a valid session cookie AND an active tbl_users row.
 * Pass roles to restrict further, e.g. require_dashboard('admin').
 * @param roles allowed roles; empty = any active dashboard user
 */
exports.require_dashboard = function (...roles) {

    return function (req, res, next) {

        (async function () {

            let session;

            try {
                const token = JWT.extract(req);

                if (token === null) {
                    deny(req, res);
                    return;
                }

                session = JWT.verify(token);

            } catch (error) {
                deny(req, res);
                return;
            }

            try {
                const user = await MODEL.find_active_user(session.sub);

                if (user === undefined) {
                    res.status(403).render('error', {message: 'You do not have access to the dashboard.'});
                    return;
                }

                if (roles.length > 0 && !roles.includes(user.role)) {
                    res.status(403).render('error', {message: 'You do not have permission to perform this action.'});
                    return;
                }

                req.session = session;
                req.user = user;
                next();

            } catch (error) {
                LOGGER.module().error('ERROR: [/auth/middleware (require_dashboard)] ' + error.message);
                res.status(500).render('error', {message: 'An unexpected error occurred.'});
            }

        })();
    };
};
