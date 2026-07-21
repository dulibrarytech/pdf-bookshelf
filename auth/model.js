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

const DB = require('../config/db');
const USERS = 'tbl_users';

/**
 * Finds an active dashboard user by du_id
 * @param du_id
 * @returns {Promise<object|undefined>}
 */
exports.find_active_user = function (du_id) {

    return DB(USERS)
        .select('id', 'du_id', 'email', 'first_name', 'last_name', 'role')
        .where({du_id: String(du_id), is_active: 1})
        .first();
};
