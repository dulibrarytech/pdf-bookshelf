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
 * Upserts by filename (the storage key) and reports every direction: files
 * without rows (added), rows whose file is gone (missing), files it will not
 * catalogue because delivery could not serve them (skipped, with the fix),
 * and entries it tried to write and could not (failed).
 */

const FS = require('node:fs');
const PATH = require('node:path');
const CRYPTO = require('node:crypto');
const CONFIG = require('../config/config');
const DB = require('../config/db');
const LOGGER = require('../libs/log4');

const PDFS = 'tbl_pdfs';
const EXTENSION = '.pdf';

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
 *
 * Only a file ending in exactly ".pdf" is catalogued. Delivery reconstructs
 * the path as `<filename>.pdf` (pdfs/controller.js), so "Minutes.PDF" would
 * become a record that a case-sensitive server can never serve - and the next
 * re-sync would report it healthy. Such files are reported as skipped, with
 * the fix, instead of becoming a row that 404s.
 *
 * Subdirectories and dotfiles (multer's .tmp staging, .gitkeep) are
 * infrastructure and are passed over silently.
 *
 * @param dir absolute path
 * @returns {Promise<{files: Map, skipped: object[]}>} files: storage filename
 *   (no extension) -> {name, size}; skipped: [{name, reason}]
 */
async function scan_storage(dir) {

    const entries = await FS.promises.readdir(dir, {withFileTypes: true});
    const files = new Map();
    const skipped = [];

    for (const entry of entries) {

        if (!entry.isFile() || entry.name.startsWith('.')) {
            continue;
        }

        if (!entry.name.endsWith(EXTENSION)) {

            skipped.push({
                name: entry.name,
                reason: /\.pdf$/i.test(entry.name)
                    ? 'The extension must be lowercase ".pdf". Delivery opens the file by that exact name, which a case-sensitive server cannot find. Rename the file.'
                    : 'Not a PDF. Only files ending in ".pdf" are catalogued.'
            });
            continue;
        }

        const stat = await FS.promises.stat(PATH.join(dir, entry.name));
        files.set(entry.name.slice(0, -EXTENSION.length), {name: entry.name, size: stat.size});
    }

    return {files: files, skipped: skipped};
}

/**
 * Decides what reconciling the two sides requires, without doing any of it.
 * Pure, so the rules are testable without a database or a filesystem.
 * @param files from scan_storage
 * @param rows tbl_pdfs rows {id, filename, file_size, sha256, is_active}
 * @returns {{add: object[], remeasure: object[], missing: string[], skipped: object[]}}
 */
function plan(files, rows) {

    const by_filename = new Map(rows.map((row) => [row.filename, row]));

    /*
     * tbl_pdfs compares filenames case-insensitively (utf8mb4_unicode_ci), so
     * "Minutes" and "minutes" are one key to the unique index even though they
     * are two different files to a Linux filesystem. Catch the collision here,
     * with a message that names the fix, rather than letting the INSERT fail
     * on it.
     */
    const by_folded = new Map(rows.map((row) => [row.filename.toLowerCase(), row]));
    const add = [];
    const remeasure = [];
    const missing = [];
    const skipped = [];

    for (const [filename, file] of files) {

        const row = by_filename.get(filename);

        if (row === undefined) {

            const variant = by_folded.get(filename.toLowerCase());

            if (variant !== undefined) {
                skipped.push({
                    name: file.name,
                    reason: `Differs only in capitalisation from the existing record "${variant.filename}", and the database treats those as the same name. Rename the file to "${variant.filename}.pdf".`
                });
                continue;
            }

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
            missing.push(row.filename + EXTENSION);
        }
    }

    return {add: add, remeasure: remeasure, missing: missing, skipped: skipped};
}

/**
 * Turns a write failure into something an administrator can act on
 * @param error
 */
function describe_failure(error) {

    if (error.code === 'ER_DUP_ENTRY') {
        return 'A record with an equivalent filename already exists - the database compares names case- and accent-insensitively. Rename the file to match that record exactly.';
    }

    return error.message;
}

/**
 * Applies a plan one entry at a time. A single bad entry is reported under
 * `failed` and the rest still land; before this, one failed INSERT threw out
 * of the loop with everything before it already committed and only
 * "Re-sync failed." to show for it.
 * @param storage absolute storage path
 * @param planned from plan()
 * @param ops {insert(row), update(id, fields)} the database writes, injected
 *   so the loop is testable without one
 * @param on_progress (done, total) after each entry, for a watcher
 * @returns {Promise<{added: string[], updated: string[], failed: object[]}>}
 */
async function apply(storage, planned, ops, on_progress = function () {}) {

    const added = [];
    const updated = [];
    const failed = [];
    const total = planned.add.length + planned.remeasure.length;
    let done = 0;

    for (const entry of planned.add) {

        try {

            await ops.insert({
                uuid: CRYPTO.randomUUID(),
                filename: entry.filename,
                title: entry.filename,
                file_size: entry.file.size,
                sha256: await sha256_file(PATH.join(storage, entry.file.name))
            });

            added.push(entry.file.name);

        } catch (error) {
            failed.push({name: entry.file.name, message: describe_failure(error)});
        }

        on_progress(++done, total);
    }

    for (const entry of planned.remeasure) {

        try {

            await ops.update(entry.id, {
                file_size: entry.file.size,
                sha256: await sha256_file(PATH.join(storage, entry.file.name))
            });

            updated.push(entry.file.name);

        } catch (error) {
            failed.push({name: entry.file.name, message: describe_failure(error)});
        }

        on_progress(++done, total);
    }

    return {added: added, updated: updated, failed: failed};
}

/**
 * One full reconciliation, writing its progress into the job as it goes
 * @param job {scanned, progress: {done, total}} - updated in place
 * @returns {Promise<object>} the report
 */
async function perform(job) {

    const storage = PATH.resolve(CONFIG.storage_path);
    const { files, skipped } = await scan_storage(storage);
    job.scanned = files.size;

    const rows = await DB(PDFS).select('id', 'filename', 'file_size', 'sha256', 'is_active');
    const planned = plan(files, rows);
    job.progress.total = planned.add.length + planned.remeasure.length;

    const { added, updated, failed } = await apply(storage, planned, {
        insert: (row) => DB(PDFS).insert(row),
        update: (id, fields) => DB(PDFS).where({id: id}).update(fields)
    }, function (done, total) {
        job.progress.done = done;
        job.progress.total = total;
    });

    return {
        scanned: files.size,
        added: added,
        updated: updated,
        missing: planned.missing,
        skipped: skipped.concat(planned.skipped),
        failed: failed
    };
}

/*
 * The run in progress, or the last one. One at a time: the work used to run
 * inside the request that asked for it, with no guard against two
 * administrators starting it at once - their inserts raced on the filename
 * index - and a runtime that grew with the corpus (every unhashed file is
 * read in full) until it outlived the proxy's patience. Now the request
 * starts a job and returns; the page watches it. Single-instance app, so an
 * in-process record is the whole story.
 */
let job = null;

function new_job(started_by) {

    return {
        started_by: started_by,
        started_at: Date.now(),
        finished_at: null,
        scanned: null,
        progress: {done: 0, total: 0},
        report: null,
        error: null
    };
}

/**
 * Starts a reconciliation in the background, or joins the one running.
 * @param started_by the administrator's user id, for the log
 * @param run the work; perform() outside tests
 * @returns {{job: object, joined: boolean}} joined when a run was already
 *   in progress and this call did not start another
 */
function start(started_by, run = perform) {

    if (job !== null && job.finished_at === null) {
        return {job: job, joined: true};
    }

    const current = new_job(started_by);
    job = current;

    run(current).then(function (report) {

        current.report = report;
        LOGGER.module().info(`resync started by user ${started_by}: ${JSON.stringify({scanned: report.scanned, added: report.added.length, updated: report.updated.length, missing: report.missing.length, skipped: report.skipped.length, failed: report.failed.length})}`);

    }, function (error) {

        current.error = error.message;
        LOGGER.module().error('ERROR: [/utils/model (resync)] ' + error.message);

    }).finally(function () {
        current.finished_at = Date.now();
    });

    return {job: current, joined: false};
}

exports.start = (started_by) => start(started_by);

/** The run in progress or the last one, or null after a restart */
exports.status = () => job;

/** The whole run, waited on - for scripts and tests; the app uses start() */
exports.resync = () => perform(new_job(null));

/* exported for tests */
exports._scan_storage = scan_storage;
exports._plan = plan;
exports._apply = apply;
exports._start_with = start;
exports._reset_job = () => { job = null; };
