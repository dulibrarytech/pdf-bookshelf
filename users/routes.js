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

const USERS = require('../users/controller');
const TOKEN = require('../libs/tokens');
const API_PATH = '';

module.exports = function (app) {

    app.route(API_PATH + '/api/v1/users')
    .get(TOKEN.verify, USERS.get_users)
    .put(TOKEN.verify, USERS.update_user)
    .post(TOKEN.verify, USERS.save_user)
    .delete(TOKEN.verify, USERS.delete_user);
};