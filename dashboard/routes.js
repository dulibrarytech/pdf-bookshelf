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

module.exports = function (app) {

    app.route(CONFIG.app_path + '/dashboard/home')
        .get(MIDDLEWARE.require_dashboard(), CONTROLLER.get_dashboard_home);

    app.route(CONFIG.app_path + '/dashboard/pdfs')
        .get(MIDDLEWARE.require_dashboard(), CONTROLLER.get_pdf_table);

    app.route(CONFIG.app_path + '/dashboard/pdfs/:uuid/row')
        .get(MIDDLEWARE.require_dashboard(), CONTROLLER.get_pdf_row);

    app.route(CONFIG.app_path + '/dashboard/pdfs/:uuid/edit')
        .get(MIDDLEWARE.require_dashboard(), CONTROLLER.get_pdf_edit_row);

    app.route(CONFIG.app_path + '/dashboard/pdfs/:uuid')
        .put(MIDDLEWARE.require_dashboard(), CONTROLLER.update_pdf)
        .delete(MIDDLEWARE.require_dashboard('admin'), CONTROLLER.deactivate_pdf);
};
