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

    app.route(CONFIG.app_path + '/viewer')
        .get(MIDDLEWARE.require_viewer, CONTROLLER.get_viewer);

    app.route(CONFIG.app_path + '/pdf/:id')
        .get(MIDDLEWARE.require_viewer, CONTROLLER.get_pdf);

    /* legacy v1 URLs lived at the domain root */
    app.get('/viewer', function (req, res) {
        const pdf = typeof req.query.pdf === 'string' ? req.query.pdf : '';
        res.redirect(301, `${CONFIG.app_path}/viewer?pdf=${encodeURIComponent(pdf)}`);
    });

    /*
     * Legacy cataloged links: v1 exposed /pdf/<filename> at the domain root
     * and used it as the entry point from catalog records - unauthenticated
     * clicks went through SSO and landed on the viewer. Preserve that UX by
     * sending the link to the viewer page (which resolves legacy filenames
     * AND uuids); raw delivery stays under APP_PATH /pdf/:id.
     */
    app.get('/pdf/:filename', function (req, res) {
        res.redirect(301, `${CONFIG.app_path}/viewer?pdf=${encodeURIComponent(req.params.filename)}`);
    });
};
