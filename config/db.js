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

const CONFIG = require('./config');
const KNEX = require('knex');

/**
 * Single shared knex instance
 */
const DB = KNEX({
    client: 'mysql2',
    connection: {
        host: CONFIG.db_host,
        port: CONFIG.db_port,
        user: CONFIG.db_user,
        password: CONFIG.db_password,
        database: CONFIG.db_name,
        charset: 'utf8mb4'
    },
    pool: {
        min: 0,
        max: 10
    }
});

module.exports = DB;
