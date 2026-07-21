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

exports.resync = async function () {

    const storage = PATH.resolve(CONFIG.storage_path);
    const entries = await FS.promises.readdir(storage, {withFileTypes: true});

    const files = new Map();

    for (const entry of entries) {

        if (!entry.isFile() || entry.name.startsWith('.') || !/\.pdf$/i.test(entry.name)) {
            continue;
        }

        const stat = await FS.promises.stat(PATH.join(storage, entry.name));
        files.set(entry.name.replace(/\.pdf$/i, ''), {name: entry.name, size: stat.size});
    }

    const rows = await DB(PDFS).select('id', 'filename', 'file_size', 'sha256', 'is_active');
    const by_filename = new Map(rows.map((row) => [row.filename, row]));

    const added = [];
    const updated = [];
    const missing = [];

    for (const [filename, file] of files) {

        const row = by_filename.get(filename);

        if (row === undefined) {

            await DB(PDFS).insert({
                uuid: CRYPTO.randomUUID(),
                filename: filename,
                title: filename,
                file_size: file.size,
                sha256: await sha256_file(PATH.join(storage, file.name))
            });

            added.push(file.name);
            continue;
        }

        if (Number(row.file_size) !== file.size || row.sha256 === null) {

            await DB(PDFS).where({id: row.id}).update({
                file_size: file.size,
                sha256: await sha256_file(PATH.join(storage, file.name))
            });

            updated.push(file.name);
        }
    }

    for (const row of rows) {

        if (row.is_active === 1 && !files.has(row.filename)) {
            missing.push(row.filename + '.pdf');
        }
    }

    return {
        scanned: files.size,
        added: added,
        updated: updated,
        missing: missing
    };
};
