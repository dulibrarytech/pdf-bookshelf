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
 * Storage <-> database reconciliation. Replaces v1's /reload, which
 * batch-inserted every file on every run and doubled tbl_data.
 *
 * Upserts by filename (the storage key) and reports both directions:
 * files without rows (added), rows whose file is gone (missing).
 */

const FS = require('node:fs');
const PATH = require('node:path');
const CRYPTO = require('node:crypto');
const CONFIG = require('../config/config');
const DB = require('../config/db');

const PDFS = 'tbl_pdfs';

function sha256_file(path) {

    return new Promise(function (resolve, reject) {

        const hash = CRYPTO.createHash('sha256');
        const stream = FS.createReadStream(path);

        stream.on('data', (chunk) => hash.update(chunk));
        stream.on('end', () => resolve(hash.digest('hex')));
        stream.on('error', reject);
    });
}

/**
 * Reads the PDFs actually present in a storage directory.
 * Subdirectories, dotfiles (multer's .tmp staging) and non-PDFs are skipped.
 * @param dir absolute path
 * @returns {Promise<Map>} storage filename (no extension) -> {name, size}
 */
async function scan_storage(dir) {

    const entries = await FS.promises.readdir(dir, {withFileTypes: true});
    const files = new Map();

    for (const entry of entries) {

        if (!entry.isFile() || entry.name.startsWith('.') || !/\.pdf$/i.test(entry.name)) {
            continue;
        }

        const stat = await FS.promises.stat(PATH.join(dir, entry.name));
        files.set(entry.name.replace(/\.pdf$/i, ''), {name: entry.name, size: stat.size});
    }

    return files;
}

/**
 * Decides what reconciling the two sides requires, without doing any of it.
 * Pure, so the rules are testable without a database or a filesystem.
 * @param files from scan_storage
 * @param rows tbl_pdfs rows {id, filename, file_size, sha256, is_active}
 * @returns {{add: object[], remeasure: object[], missing: string[]}}
 */
function plan(files, rows) {

    const by_filename = new Map(rows.map((row) => [row.filename, row]));
    const add = [];
    const remeasure = [];
    const missing = [];

    for (const [filename, file] of files) {

        const row = by_filename.get(filename);

        if (row === undefined) {
            add.push({filename: filename, file: file});
            continue;
        }

        /*
         * A changed size means the file was replaced behind the app's back. A
         * null sha256 is a row that predates hashing, or one a previous run
         * never got to - either way it needs measuring.
         */
        if (Number(row.file_size) !== file.size || row.sha256 === null) {
            remeasure.push({id: row.id, filename: filename, file: file});
        }
    }

    for (const row of rows) {

        /* an inactive row with no file is expected, not a problem to report */
        if (row.is_active === 1 && !files.has(row.filename)) {
            missing.push(row.filename + '.pdf');
        }
    }

    return {add: add, remeasure: remeasure, missing: missing};
}

exports.resync = async function () {

    const storage = PATH.resolve(CONFIG.storage_path);
    const files = await scan_storage(storage);
    const rows = await DB(PDFS).select('id', 'filename', 'file_size', 'sha256', 'is_active');
    const { add, remeasure, missing } = plan(files, rows);

    const added = [];
    const updated = [];

    for (const entry of add) {

        await DB(PDFS).insert({
            uuid: CRYPTO.randomUUID(),
            filename: entry.filename,
            title: entry.filename,
            file_size: entry.file.size,
            sha256: await sha256_file(PATH.join(storage, entry.file.name))
        });

        added.push(entry.file.name);
    }

    for (const entry of remeasure) {

        await DB(PDFS).where({id: entry.id}).update({
            file_size: entry.file.size,
            sha256: await sha256_file(PATH.join(storage, entry.file.name))
        });

        updated.push(entry.file.name);
    }

    return {
        scanned: files.size,
        added: added,
        updated: updated,
        missing: missing
    };
};

/* exported for tests */
exports._scan_storage = scan_storage;
exports._plan = plan;
