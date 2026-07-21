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

/*
 * v1 baseline schema. Guarded: on a database restored from the v1 dump the
 * tables already exist and this migration records itself without touching them.
 * On a fresh database it creates the v1 shape that 000002 then upgrades.
 */

exports.up = async function (knex) {

    const has_data = await knex.schema.hasTable('tbl_data');
    const has_pdfs = await knex.schema.hasTable('tbl_pdfs');

    if (!has_data && !has_pdfs) {
        await knex.raw(`
            CREATE TABLE tbl_data (
                id INT(11) UNSIGNED NOT NULL AUTO_INCREMENT,
                filename VARCHAR(255) NOT NULL DEFAULT '',
                file_size INT(11) DEFAULT 0,
                hits INT(11) NOT NULL DEFAULT 0,
                created TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);
    }

    const has_users = await knex.schema.hasTable('tbl_users');

    if (!has_users) {
        await knex.raw(`
            CREATE TABLE tbl_users (
                id INT(11) UNSIGNED NOT NULL AUTO_INCREMENT,
                du_id VARCHAR(255) DEFAULT NULL,
                email VARCHAR(255) DEFAULT NULL,
                first_name VARCHAR(255) DEFAULT NULL,
                last_name VARCHAR(255) DEFAULT NULL,
                is_active TINYINT(1) DEFAULT 1,
                created TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);
    }
};

exports.down = async function (knex) {
    /* baseline - intentionally not reversible */
};
