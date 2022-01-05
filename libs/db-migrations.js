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

const DB = require('../config/db')(),
    LOGGER = require('../libs/log4'),
    USERS = 'tbl_users',
    DATA = 'tbl_data';

// https://stackoverflow.com/questions/35089571/knex-js-create-table-and-insert-data
/**
 * Creates test user table
 */
const create_users_table = function () {

    DB.schema.createTable(USERS, function (table) {
        table.increments();
        table.string('du_id');
        table.string('email');
        table.string('first_name');
        table.string('last_name');
        table.integer('is_active').defaultTo(1);
        table.timestamp('created').defaultTo(DB.raw('CURRENT_TIMESTAMP'));
    })
        .then(function () {
            console.log(USERS + ' table created.');
        })
        .catch(function (error) {
            console.log(error);
        });
};

/**
 * Creates test data table
 */
const create_data_table = function () {

    DB.schema.createTable(DATA, function (table) {
        table.increments();
        table.string('file_name', 255);
        table.integer('file_size');
        table.integer('hits');
        table.timestamp('created').defaultTo(DB.raw('CURRENT_TIMESTAMP'));
    })
        .then(function () {
            console.log(DATA + ' table created.');
        })
        .catch(function (error) {
            console.log(error);
        });
};

/**
 *  Creates db test tables
 */
exports.up = function () {
    create_users_table();
    create_data_table();
};

/**
 * Removes db test tables
 */
exports.down = function () {

    DB.schema
        .dropTable(DATA)
        .dropTable(DATA)
        .then(function() {
            console.log('Removing test tables');
        })
        .catch(function(error) {
            console.log(error);
        });
};