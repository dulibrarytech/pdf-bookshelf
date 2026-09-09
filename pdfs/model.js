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

const DB = require('../config/db');
const LOGGER = require('../libs/log4');
const PDFS = 'tbl_pdfs';

const SORTABLE = ['title', 'filename', 'file_size', 'hits', 'created'];
const PAGE_SIZE = 25;

/**
 * Gets one active record by public uuid
 * @param uuid
 */
exports.get_by_uuid = function (uuid) {

    return DB(PDFS)
        .select('id', 'uuid', 'filename', 'title', 'file_size', 'hits', 'created')
        .where({uuid: String(uuid), is_active: 1})
        .first();
};

/**
 * Gets one active record by storage filename (legacy v1 links)
 * @param filename
 */
exports.get_by_filename = function (filename) {

    return DB(PDFS)
        .select('id', 'uuid', 'filename', 'title')
        .where({filename: String(filename), is_active: 1})
        .first();
};

/**
 * Atomically bumps the hit counter (v1 read-then-wrote and lost updates)
 * Fire-and-forget: delivery never waits on, or fails because of, the counter.
 * @param id
 */
exports.increment_hits = function (id) {

    DB(PDFS)
        .where({id: id})
        .increment('hits', 1)
        .catch(function (error) {
            LOGGER.module().error('ERROR: [/pdfs/model (increment_hits)] ' + error.message);
        });
};

/**
 * Lists active records for the bookshelf table
 * @param options {q, sort, dir, page}
 * @returns {Promise<{rows, page, page_count, total, q, sort, dir}>}
 */
/*
 * Normalises the query-string options the bookshelf table is driven by.
 *
 * `sort` in particular goes into an ORDER BY, so it is whitelisted against
 * SORTABLE rather than passed through - anything unrecognised falls back to
 * `created` instead of reaching the query builder.
 *
 * @param options {q, sort, dir, page} straight off req.query
 */
function normalize_list_options(options = {}) {

    return {
        q: typeof options.q === 'string' ? options.q.trim() : '',
        sort: SORTABLE.includes(options.sort) ? options.sort : 'created',
        dir: options.dir === 'asc' ? 'asc' : 'desc',
        page: Math.max(1, parseInt(options.page, 10) || 1)
    };
}

exports.list = async function (options = {}) {

    const { q, sort, dir, page } = normalize_list_options(options);

    function scope(builder) {

        builder.where({is_active: 1});

        if (q.length > 0) {
            builder.andWhere(function () {
                this.where('title', 'like', `%${q}%`).orWhere('filename', 'like', `%${q}%`);
            });
        }
    }

    const [count] = await DB(PDFS).modify(scope).count('id as total');
    const total = Number(count.total);
    const page_count = Math.max(1, Math.ceil(total / PAGE_SIZE));
    const current = Math.min(page, page_count);

    const rows = await DB(PDFS)
        .select('uuid', 'filename', 'title', 'file_size', 'hits', 'created')
        .modify(scope)
        .orderBy(sort, dir)
        .orderBy('id', 'desc')
        .limit(PAGE_SIZE)
        .offset((current - 1) * PAGE_SIZE);

    return {rows, total, page: current, page_count, q, sort, dir};
};

/**
 * Updates PDF metadata (title only - filename is the storage key)
 * @param uuid
 * @param title
 */
exports.update_title = function (uuid, title) {

    return DB(PDFS)
        .where({uuid: String(uuid), is_active: 1})
        .update({title: title});
};

/**
 * Soft-deletes a record
 * @param uuid
 */
exports.deactivate = function (uuid) {

    return DB(PDFS)
        .where({uuid: String(uuid)})
        .update({is_active: 0});
};

/* exported for tests */
exports._normalize_list_options = normalize_list_options;
