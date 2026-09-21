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

/*
 * tbl_users.du_id is the SSO identity key - every sign-in looks it up - and it
 * had no unique index. users/model.create() checked for an existing row and
 * then inserted, so two administrators adding the same DU ID in the same
 * instant produced two rows, and find_active_user() then picked one of them
 * arbitrarily. The index makes the database refuse the second row; the model
 * turns that refusal into the same "already exists" answer the check gives.
 *
 * Refuses, rather than deduplicating, if duplicates already exist: which row
 * should survive (role, active flag and email may all differ) is a person's
 * call, and nothing is changed until it is made. Multiple NULLs are allowed by
 * a unique index and are left alone - a row without a du_id cannot sign in.
 */

const INDEX = 'idx_users_du_id';

exports.up = async function (knex) {

    const [duplicates] = await knex.raw(
        'SELECT du_id, COUNT(*) AS occurrences FROM tbl_users WHERE du_id IS NOT NULL GROUP BY du_id HAVING COUNT(*) > 1'
    );

    if (duplicates.length > 0) {

        const listed = duplicates.map((row) => `${row.du_id} (${row.occurrences} rows)`).join(', ');

        throw new Error(
            `Refusing to add the unique index on tbl_users.du_id: these DU IDs have more than one row - ${listed}. ` +
            'Decide which row to keep for each (role, active flag and email may differ), delete the others, and run the migration again.'
        );
    }

    /* re-runnable: a previous run that got this far has nothing more to do */
    const [existing] = await knex.raw(`SHOW INDEX FROM tbl_users WHERE Key_name = '${INDEX}'`);

    if (existing.length > 0) {
        return;
    }

    await knex.raw(`ALTER TABLE tbl_users ADD UNIQUE INDEX ${INDEX} (du_id)`);
};

/*
 * Dropping the index loses nothing, but rollback is opt-in for every migration
 * here (see 20260720000002): knex rolls a batch back together, a fresh
 * database has all three in one batch, and a `down` that succeeded quietly
 * here would leave the batch half-reversed when the next one refuses.
 */
exports.down = async function (knex) {

    if (process.env.ALLOW_DESTRUCTIVE_ROLLBACK !== '1') {
        throw new Error(
            'Refusing to roll back 20260921000003_unique_du_id without ALLOW_DESTRUCTIVE_ROLLBACK=1. Dropping the index ' +
            'itself loses nothing, but rollback is opt-in for every migration here so a batch never half-reverses. ' +
            'Restore from a dump to undo a deploy.'
        );
    }

    await knex.raw(`ALTER TABLE tbl_users DROP INDEX ${INDEX}`);
};
