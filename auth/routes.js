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

    app.route(CONFIG.app_path + '/login')
        .get(CONTROLLER.sso_start);

    app.route(CONFIG.app_path + '/sso')
        .post(RATE_LIMIT({window_ms: 60000, max: 30}), CONTROLLER.sso_callback);

    app.route(CONFIG.app_path + '/signed-in')
        .get(CONTROLLER.signed_in);

    app.route(CONFIG.app_path + '/logout')
        .get(CONTROLLER.logout);
};
