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
 * SSO flow.
 *
 * GET  /login  -> bounce to the SSO provider, preserving ?next
 * POST /sso    -> callback from the identity proxy; verification order:
 *   1. request shape (numeric employeeID <= 10 digits)
 *   2. HMAC signature            (SSO_REQUIRE_HMAC, default OFF)
 *   3. timestamp + nonce         (always with 2; SSO_REQUIRE_FRESHNESS alone, default OFF)
 *   4. legacy HTTP_HOST match    (defense-in-depth only, if SSO_HOST set)
 *   5. tbl_users lookup decides the tier, THEN the cookie is minted
 * GET  /logout -> a confirmation page; it changes nothing
 * POST /logout -> clear cookie, then the IdP's sign-out or the signed-out
 *                 page - but only for a request from this origin, so a link
 *                 or form on someone else's page cannot sign people out
 *
 * Layers 2 and 3 are BUILT AND TESTED BUT OFF BY DEFAULT, because the DU
 * authproxy does not sign its callbacks yet. Enabling them is coordinated
 * with DU IT and is not a change to make here unilaterally - the same
 * position repo-backend-v2 is in. While they are off, identity is whatever
 * the callback POSTs and SSO_HOST is the only thing narrowing who may send
 * it, so SSO_HOST should always be set in a deployed environment. The app
 * logs a warning at boot naming exactly which layers are inactive, so this
 * posture is visible rather than something you have to read config to learn.
 *
 * The two v1 critical holes this replaces: identity was trusted straight from
 * the browser-POSTed body, and the viewer JWT was minted BEFORE any user
 * check. Every attempt here - success or fail - emits a structured audit line.
 */

const VALIDATOR = require('validator');
const CONFIG = require('../config/config');
const JWT = require('../libs/jwt');
const LOGGER = require('../libs/log4');
const MODEL = require('./model');
const HMAC = require('./sso/hmac');
const REPLAY_GUARD = require('./sso/replay_guard');
const { same_origin } = require('../libs/origin');
const { ValidationError, UnauthorizedError } = require('../libs/errors');

/**
 * Only allows same-app relative redirect targets
 * @param raw
 * @param fallback
 */
function safe_next(raw, fallback) {

    if (typeof raw !== 'string' || raw.length === 0) {
        return fallback;
    }

    const decoded = raw.trim();

    if (!decoded.startsWith('/') || decoded.startsWith('//')) {
        return fallback;
    }

    if (decoded.includes('\n') || decoded.includes('\r') || decoded.includes('\\')) {
        return fallback;
    }

    return decoded;
}

function validate_shape(body) {

    if (!body || typeof body !== 'object') {
        throw new ValidationError('Body required');
    }

    const employee_id = String(body.employeeID || '').trim();

    if (employee_id.length === 0 || !VALIDATOR.isNumeric(employee_id)) {
        throw new ValidationError('employeeID must be numeric');
    }

    if (employee_id.length > 10) {
        throw new ValidationError('employeeID exceeds 10 digits');
    }

    return employee_id;
}

/**
 * GET /login - kicks off the SSO redirect
 */
exports.sso_start = function (req, res) {

    if (!CONFIG.sso_url) {
        res.status(503).render('error', {message: 'Sign-in is not configured (SSO_URL is empty).'});
        return;
    }

    /*
     * Only a caller-supplied ?next rides along. With none, the callback falls
     * back by tier - dashboard users to the bookshelf, everyone else to the
     * signed-in page. A default of /dashboard/home here used to defeat that:
     * a viewer arriving through /login (or the root redirect) signed in and
     * landed on "You do not have access to the dashboard."
     */
    const next = safe_next(req.query.next, '');
    const target = new URL(CONFIG.sso_url);

    if (CONFIG.sso_response_url) {
        /* legacy authproxy convention: it POSTs back to app_url with its query intact */
        target.searchParams.set('app_url', next.length > 0
            ? `${CONFIG.sso_response_url}?next=${encodeURIComponent(next)}`
            : CONFIG.sso_response_url);
    }

    res.redirect(302, target.toString());
};

/**
 * Where a browser should go to try the sign-in again: back through /login,
 * keeping the page it was heading for. Offered on the /sso rate limit's
 * refusal page, where the student has already authenticated upstream and a
 * reload would only re-post the callback.
 * @param req the refused callback
 */
exports.retry_sign_in_url = function (req) {

    const next = safe_next(req.query.next || (req.body ? req.body.next : undefined), '');

    return next.length > 0
        ? `${CONFIG.app_path}/login?next=${encodeURIComponent(next)}`
        : `${CONFIG.app_path}/login`;
};

/**
 * POST /sso - callback from the identity proxy
 */
exports.sso_callback = async function (req, res) {

    /*
     * Freshness follows the signature. The signature covers the timestamp
     * and nonce precisely so that a captured callback cannot be replayed; a
     * signed callback never checked for them could be replayed for as long
     * as the secret lives, which is what SSO_REQUIRE_HMAC=1 with
     * SSO_REQUIRE_FRESHNESS=0 used to allow. The flag on its own still runs
     * the guard with the signature off, for what little that is worth.
     */
    const check_freshness = CONFIG.sso_require_hmac || CONFIG.sso_require_freshness;

    const audit = {
        event: 'sso_attempt',
        ip: req.ip,
        layers: {
            hmac: CONFIG.sso_require_hmac,
            freshness: check_freshness,
            host_check: Boolean(CONFIG.sso_host)
        }
    };

    try {

        const employee_id = validate_shape(req.body);
        audit.employee_id = employee_id;

        if (CONFIG.sso_require_hmac) {

            const secrets = [CONFIG.sso_hmac_secret, CONFIG.sso_hmac_secret_next].filter(Boolean);

            if (secrets.length === 0) {
                /* fail-closed: misconfiguration = no access, not access-anyway */
                audit.outcome = 'misconfigured:no_hmac_secret';
                LOGGER.module().error(JSON.stringify(audit));
                res.status(500).render('error', {message: 'Sign-in is misconfigured. Contact the administrator.'});
                return;
            }

            HMAC.verify(req.body, secrets);
        }

        if (check_freshness) {
            REPLAY_GUARD.check(req.body.timestamp, req.body.nonce, {
                max_skew_seconds: CONFIG.sso_max_skew_seconds
            });
        }

        if (CONFIG.sso_host) {

            const http_host = String(req.body.HTTP_HOST || '');

            if (!VALIDATOR.isFQDN(http_host) || http_host !== CONFIG.sso_host) {
                throw new UnauthorizedError('Authentication failed');
            }
        }

        /* tier decision BEFORE minting anything (v1 minted first, checked later) */
        const user = await MODEL.find_active_user(employee_id);
        const tier = user === undefined ? 'viewer' : 'dashboard';
        audit.tier = tier;

        JWT.issue_cookie(res, {sub: employee_id, tier: tier});

        audit.outcome = 'success';
        LOGGER.module().info(JSON.stringify(audit));

        const fallback = tier === 'dashboard'
            ? `${CONFIG.app_path}/dashboard/home`
            : `${CONFIG.app_path}/signed-in`;

        res.redirect(303, safe_next(req.query.next || req.body.next, fallback));

    } catch (error) {

        audit.outcome = 'rejected:' + (error.code || 'error');
        audit.error = error.message;
        LOGGER.module().warn(JSON.stringify(audit));

        const status = error.status || 500;
        res.status(status).render('error', {message: 'Authentication failed.'});
    }
};

/**
 * GET /signed-in - landing page for viewers who authenticated without a target
 */
exports.signed_in = function (req, res) {
    res.render('error', {message: 'You are signed in. Follow a PDF link to open a document.'});
};

/*
 * Signing out was a GET, so any page could do it to anyone with a link:
 * SameSite=Lax cookies ride along on a top-level navigation. A POST alone
 * would not close that, because a cross-site form submission is a
 * navigation too, and the response's Set-Cookie would still clear the
 * session. What closes it is same_origin() (libs/origin.js): the browser's
 * own word on where the request came from.
 */

/**
 * GET /logout - a confirmation page, for a typed or bookmarked address.
 * Changes nothing; the button on it posts.
 */
exports.logout_page = function (req, res) {
    res.render('sign-out', {});
};

/**
 * POST /logout
 */
exports.logout = function (req, res) {

    /*
     * A form on someone else's page gets the same confirmation page a typed
     * address gets, and the session stays. If the person really wants out,
     * the button on it is a same-origin post.
     */
    if (!same_origin(req)) {
        res.render('sign-out', {});
        return;
    }

    JWT.clear_cookie(res);

    /*
     * When SSO_LOGOUT_URL is configured, redirect to the IdP's central
     * signout so the user is logged out everywhere, not just here
     * (same behavior as repo-backend-v2). The local signed-out page is
     * the fallback for environments without an IdP (dev).
     */
    if (CONFIG.sso_logout_url) {
        res.redirect(303, CONFIG.sso_logout_url);
        return;
    }

    res.render('logout', {});
};

/* exported for tests */
exports._safe_next = safe_next;
exports._validate_shape = validate_shape;
