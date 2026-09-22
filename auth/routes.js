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

const CONFIG = require('../config/config');
const CONTROLLER = require('./controller');
const RATE_LIMIT = require('../libs/rate_limit');

module.exports = function (app) {

    /*
     * The bare hostname and the app's own root go into sign-in; /login routes
     * each tier afterwards. 302, not 301, so a cached redirect cannot outlive
     * a change of mind. Monitoring has /healthcheck.
     */
    const into_sign_in = function (req, res) {
        res.redirect(302, CONFIG.app_path + '/login');
    };

    app.get('/', into_sign_in);
    app.get(CONFIG.app_path + '/', into_sign_in);

    app.route(CONFIG.app_path + '/login')
        .get(CONTROLLER.sso_start);

    /*
     * Per client address per minute, sized for a room signing in behind one
     * campus address (SSO_RATE_LIMIT_PER_MINUTE, default 300). A refused
     * browser gets the error page with a "Try again" back through /login.
     */
    app.route(CONFIG.app_path + '/sso')
        .post(RATE_LIMIT({
            window_ms: 60000,
            max: CONFIG.sso_rate_limit_per_minute,
            message: 'Sign-in is busy right now: too many sign-ins from your network in the last minute. Wait a moment and try again.',
            retry: CONTROLLER.retry_sign_in_url
        }), CONTROLLER.sso_callback);

    app.route(CONFIG.app_path + '/signed-in')
        .get(CONTROLLER.signed_in);

    /* GET shows a confirmation page; only a same-origin POST signs out */
    app.route(CONFIG.app_path + '/logout')
        .get(CONTROLLER.logout_page)
        .post(CONTROLLER.logout);
};
