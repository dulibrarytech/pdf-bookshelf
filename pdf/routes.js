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

const API_PATH = '/bookshelf';
const CONTROLLER = require('./controller');
const TOKEN = require('../libs/tokens');

module.exports = function (app) {

    app.route(API_PATH + '/viewer')
        .get(CONTROLLER.get_pdf_viewer);  // TOKEN.verify,

    app.route(API_PATH + '/pdf/:filename')
        .get(CONTROLLER.get_pdf); // TOKEN.verify,

    app.route(API_PATH + '/api/v1/pdfs')
        .get(CONTROLLER.get_pdf_records)  // TOKEN.verify,
};