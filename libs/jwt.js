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
 * JWT helpers - sign/verify plus httpOnly cookie issuance/extraction.
 *
 * The session token travels only in an httpOnly, SameSite=Lax cookie: JS
 * cannot read it, and the pdf.js viewer needs no token plumbing because the
 * cookie rides along on /pdf/:uuid requests.
 */

const JWT = require('jsonwebtoken');
const CONFIG = require('../config/config');

const COOKIE_NAME = 'bookshelf_session';

function secret() {

    if (!CONFIG.token_secret) {
        throw new Error('TOKEN_SECRET is not configured');
    }

    return CONFIG.token_secret;
}

/**
 * Signs a session payload
 * @param payload
 */
exports.sign = function (payload) {

    return JWT.sign(payload, secret(), {
        algorithm: CONFIG.token_algo,
        expiresIn: CONFIG.token_expires,
        issuer: CONFIG.token_issuer || 'pdf-bookshelf'
    });
};

/**
 * Verifies a session token (throws on failure)
 * @param token
 */
exports.verify = function (token) {

    return JWT.verify(token, secret(), {
        algorithms: [CONFIG.token_algo],
        issuer: CONFIG.token_issuer || 'pdf-bookshelf'
    });
};

/*
 * Scoped to APP_PATH, not '/': everything that reads the session lives under
 * APP_PATH, and the routes outside it take no auth. Falls back to '/' when
 * APP_PATH is empty, the documented way to mount at the domain root.
 */
function cookie_options() {

    return {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: CONFIG.app_path || '/'
    };
}

/**
 * Mints a session token and sets it as an httpOnly cookie
 * @param res
 * @param payload
 */
exports.issue_cookie = function (res, payload) {

    const token = exports.sign(payload);
    res.cookie(COOKIE_NAME, token, cookie_options());
    return token;
};

/**
 * Clears the session cookie
 * @param res
 */
exports.clear_cookie = function (res) {

    const options = cookie_options();
    res.clearCookie(COOKIE_NAME, options);

    /* also clear the root-scoped cookie earlier versions set; harmless once none are left */
    if (options.path !== '/') {
        res.clearCookie(COOKIE_NAME, Object.assign({}, options, {path: '/'}));
    }
};

/**
 * Extracts the session token from the request cookie
 * @param req
 * @returns {string|null}
 */
exports.extract = function (req) {

    if (req.cookies && typeof req.cookies[COOKIE_NAME] === 'string') {
        return req.cookies[COOKIE_NAME];
    }

    return null;
};

exports.COOKIE_NAME = COOKIE_NAME;
