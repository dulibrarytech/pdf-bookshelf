/**

 Copyright 2021 University of Denver

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

const DASHBOARD = require('../dashboard/controller');
const API_PATH = '';

module.exports = function (app) {

    app.route(API_PATH + '/dashboard/home')
        .get(DASHBOARD.get_dashboard_home);

    app.route(API_PATH + '/dashboard/upload')
        .get(DASHBOARD.get_dashboard_upload);

    app.route(API_PATH + '/dashboard/users')
        .get(DASHBOARD.get_dashboard_users);

    app.route(API_PATH + '/dashboard/users/edit')
        .get(DASHBOARD.get_dashboard_user_edit_form);

    app.route(API_PATH + '/dashboard/users/add')
        .get(DASHBOARD.get_dashboard_user_add_form);

    app.route(API_PATH + '/dashboard/users/delete')
        .get(DASHBOARD.get_dashboard_user_delete_form);
};