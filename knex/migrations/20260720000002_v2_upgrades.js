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

const CRYPTO = require('crypto');

/*
 * v2 schema upgrades over the imported v1 data:
 *  - tbl_data -> tbl_pdfs, both tables converted to utf8mb4
 *  - dedupe filenames (v1's /reload endpoint double-inserted; hits were
 *    duplicated per-row, not split, so the survivor keeps MAX(hits))
 *  - uuid public identifier, title, sha256, soft delete, uploaded_by, updated
 *  - unique indexes on uuid + filename (filename is the storage key)
 *  - tbl_users.role (existing v1 rows were all de-facto admins)
 */

exports.up = async function (knex) {

    const has_data = await knex.schema.hasTable('tbl_data');
    const has_pdfs = await knex.schema.hasTable('tbl_pdfs');

    if (has_data && !has_pdfs) {
        await knex.schema.renameTable('tbl_data', 'tbl_pdfs');
    }

    await knex.raw('ALTER TABLE tbl_pdfs CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
    await knex.raw('ALTER TABLE tbl_users CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');

    /* dedupe before the unique index: keep largest file_size, then highest id */
    await knex.raw(`
        UPDATE tbl_pdfs p
        JOIN (
            SELECT filename, MAX(hits) AS max_hits
            FROM tbl_pdfs
            GROUP BY filename
            HAVING COUNT(*) > 1
        ) d ON p.filename = d.filename
        SET p.hits = d.max_hits
    `);

    await knex.raw(`
        DELETE t1 FROM tbl_pdfs t1
        JOIN tbl_pdfs t2
            ON t1.filename = t2.filename
            AND (t1.file_size < t2.file_size
                OR (t1.file_size = t2.file_size AND t1.id < t2.id))
    `);

    if (!await knex.schema.hasColumn('tbl_pdfs', 'uuid')) {
        await knex.raw(`
            ALTER TABLE tbl_pdfs
                ADD COLUMN uuid CHAR(36) NULL AFTER id,
                ADD COLUMN title VARCHAR(500) NULL AFTER filename,
                ADD COLUMN sha256 CHAR(64) NULL AFTER file_size,
                ADD COLUMN is_active TINYINT(1) NOT NULL DEFAULT 1 AFTER hits,
                ADD COLUMN uploaded_by INT UNSIGNED NULL AFTER is_active,
                ADD COLUMN updated TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
                MODIFY COLUMN file_size BIGINT UNSIGNED DEFAULT 0
        `);
    }

    /* backfill uuids one row at a time (806 rows - fine) */
    const rows = await knex('tbl_pdfs').whereNull('uuid').select('id');

    for (const row of rows) {
        await knex('tbl_pdfs').where({id: row.id}).update({uuid: CRYPTO.randomUUID()});
    }

    await knex('tbl_pdfs').whereNull('title').update({title: knex.ref('filename')});

    await knex.raw(`
        ALTER TABLE tbl_pdfs
            MODIFY COLUMN uuid CHAR(36) NOT NULL,
            ADD UNIQUE INDEX idx_pdfs_uuid (uuid),
            ADD UNIQUE INDEX idx_pdfs_filename (filename)
    `);

    if (!await knex.schema.hasColumn('tbl_users', 'role')) {
        await knex.raw(`
            ALTER TABLE tbl_users
                ADD COLUMN role ENUM('admin', 'staff') NOT NULL DEFAULT 'staff' AFTER is_active
        `);

        /* every v1 user had full dashboard access */
        await knex('tbl_users').update({role: 'admin'});
    }
};

exports.down = async function (knex) {

    await knex.raw('ALTER TABLE tbl_users DROP COLUMN role');

    await knex.raw(`
        ALTER TABLE tbl_pdfs
            DROP INDEX idx_pdfs_uuid,
            DROP INDEX idx_pdfs_filename,
            DROP COLUMN uuid,
            DROP COLUMN title,
            DROP COLUMN sha256,
            DROP COLUMN is_active,
            DROP COLUMN uploaded_by,
            DROP COLUMN updated
    `);

    await knex.schema.renameTable('tbl_pdfs', 'tbl_data');
};
