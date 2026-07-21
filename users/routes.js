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

const CONFIG = require('../config/config');
const CONTROLLER = require('./controller');
const MIDDLEWARE = require('../auth/middleware');

/* user administration is admin-only */
module.exports = function (app) {

    app.route(CONFIG.app_path + '/dashboard/users')
        .get(MIDDLEWARE.require_dashboard('admin'), CONTROLLER.get_users_page)
        .post(MIDDLEWARE.require_dashboard('admin'), CONTROLLER.create_user);

    app.route(CONFIG.app_path + '/dashboard/users/:id/row')
        .get(MIDDLEWARE.require_dashboard('admin'), CONTROLLER.get_user_row);

    app.route(CONFIG.app_path + '/dashboard/users/:id/edit')
        .get(MIDDLEWARE.require_dashboard('admin'), CONTROLLER.get_user_edit_row);

    app.route(CONFIG.app_path + '/dashboard/users/:id')
        .put(MIDDLEWARE.require_dashboard('admin'), CONTROLLER.update_user)
        .delete(MIDDLEWARE.require_dashboard('admin'), CONTROLLER.deactivate_user);

    app.route(CONFIG.app_path + '/dashboard/users/:id/reactivate')
        .post(MIDDLEWARE.require_dashboard('admin'), CONTROLLER.reactivate_user);
};
