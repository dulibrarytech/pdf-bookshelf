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
 * Upload flow (v1's POST /uploads had NO auth and a broken file filter):
 *   1. multer stages each file into storage/.tmp under a random name
 *   2. per file: sha256, sanitized final name, DB uniqueness check
 *   3. publish into storage/ exclusively + insert row; a name already taken
 *      on disk or in the database is reported per file and never overwritten
 *
 * One deliberate exception to "never": a name that belongs to a REMOVED
 * record whose file is gone from storage is revived - the upload becomes that
 * record's file again, so its uuid and every catalogued link keep working
 * instead of the name being retired forever.
 */

const FS = require('node:fs');
const PATH = require('node:path');
const CRYPTO = require('node:crypto');
const CONFIG = require('../config/config');
const DB = require('../config/db');
const FORMAT = require('../libs/format');
const LOGGER = require('../libs/log4');
const STORAGE = require('../libs/storage');
const { ValidationError, ConflictError } = require('../libs/errors');

const PDFS = 'tbl_pdfs';
const EXTENSION = '.pdf';
/* %PDF- */
const PDF_MAGIC = Buffer.from('%PDF-');
/* what a filesystem allows for one name, in bytes - ext4 and most others */
const NAME_MAX_BYTES = 255;
/* tbl_pdfs.title is VARCHAR(500); the dashboard's title editor caps at the same */
const TITLE_MAX = 500;

function view_locals(req, extra = {}) {

    return Object.assign({
        app_path: CONFIG.app_path,
        appname: CONFIG.app_name,
        appversion: CONFIG.app_version,
        organization: CONFIG.organization,
        user: req.user,
        format: FORMAT
    }, extra);
}

/**
 * v1-compatible storage name: strip spaces, replace illegal chars, lowercase
 * @param original
 */
function sanitize_filename(original) {

    return PATH.basename(String(original))
        .replace(/\s+/g, '')
        .replace(/[/\\?%*:|"<>]/g, '-')
        .replace(/\.pdf$/i, '')
        .toLowerCase();
}

/**
 * Why a sanitized storage key cannot be used, or null when it can. Measured
 * in bytes, as the filesystem does: a name of 200 accented characters is 400
 * bytes of UTF-8, which is ENAMETOOLONG on Linux however few characters it
 * has - the old check counted characters and let it through.
 * @param filename the sanitized key, without the extension
 * @returns {string|null} a message for the upload results, or null
 */
function filename_problem(filename) {

    if (filename.length === 0) {
        return 'Invalid filename.';
    }

    const bytes = Buffer.byteLength(filename + EXTENSION, 'utf8');

    if (bytes > NAME_MAX_BYTES) {
        return `Filename is too long: ${bytes} bytes including "${EXTENSION}", and a file name can be at most ${NAME_MAX_BYTES}. Shorten it and upload again.`;
    }

    return null;
}

/**
 * The display title an upload starts with: the original name minus its
 * extension, trimmed and capped to what the column holds - the shape the
 * dashboard's title editor produces. Before this the untrimmed, uncapped
 * name went straight to the INSERT, which a long name failed with a raw
 * database message on screen after the file had been published and
 * unpublished again. Falls back to the storage key when nothing is left.
 * @param original the name as uploaded
 * @param filename the sanitized storage key
 */
function derive_title(original, filename) {

    const title = original.replace(/\.pdf$/i, '').trim().substring(0, TITLE_MAX);

    return title.length > 0 ? title : filename;
}

/**
 * What the results list says about a failed file. A refusal of ours carries
 * a status and is shown as it is; anything else - a database or filesystem
 * failure - names paths and drivers, not anything a staff member can act on,
 * so it is replaced by a generic line (the caller logs the real one).
 * @param error
 */
function result_message(error) {

    return error.status === undefined
        ? 'Upload failed for this file. The server log has the details.'
        : error.message;
}

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
 * Sniffs the leading bytes so a renamed .exe can't pose as a PDF
 * @param path
 */
async function is_pdf(path) {

    const fd = await FS.promises.open(path, 'r');

    try {
        const buffer = Buffer.alloc(PDF_MAGIC.length);
        await fd.read(buffer, 0, PDF_MAGIC.length, 0);
        return buffer.equals(PDF_MAGIC);
    } finally {
        await fd.close();
    }
}

exports.get_upload_page = function (req, res) {
    res.render('dashboard-upload', view_locals(req, {active: 'upload', title: 'Upload PDFs'}));
};

/**
 * POST /dashboard/uploads - files staged by multer; returns a result fragment
 */
exports.upload = async function (req, res) {

    const files = Array.isArray(req.files) ? req.files : [];
    const results = [];

    for (const file of files) {

        /* multer decodes originalname as latin1; recover utf8 titles */
        const original = Buffer.from(file.originalname, 'latin1').toString('utf8');
        const filename = sanitize_filename(original);
        const destination = PATH.join(PATH.resolve(CONFIG.storage_path), filename + EXTENSION);
        let published = false;

        try {

            const problem = filename_problem(filename);

            if (problem !== null) {
                throw new ValidationError(problem);
            }

            if (!await is_pdf(file.path)) {
                throw new ValidationError('Not a PDF file.');
            }

            const existing = await DB(PDFS).select('id', 'is_active').where({filename: filename}).first();

            if (existing !== undefined && Number(existing.is_active) === 1) {
                throw new ConflictError('A PDF with this filename is already on the bookshelf.');
            }

            const sha256 = await sha256_file(file.path);

            /*
             * The check above only sees the database. Publishing exclusively
             * is what actually protects bytes already in storage/ - from a
             * file with no row, and from a second upload of the same name
             * racing this one past the check.
             */
            try {
                await STORAGE.move_exclusive(file.path, destination);
            } catch (error) {

                if (error.code === 'EEXIST') {
                    throw new ConflictError(existing !== undefined
                        ? 'A PDF with this filename was removed from the bookshelf and its file is still in storage. Restore it from Bookshelf → Show removed instead of uploading it again.'
                        : 'A file with this name is already in storage. If it is not on the bookshelf, run Utilities → Re-sync.');
                }

                throw error;
            }

            published = true;

            const title = derive_title(original, filename);

            if (existing !== undefined) {

                /*
                 * A removed record whose file is gone: this upload puts the
                 * record back rather than creating a second one, so its uuid -
                 * and every catalogued link to it - keeps working. The
                 * filename is written too because the database matched it
                 * case-insensitively and delivery does not.
                 */
                await DB(PDFS).where({id: existing.id}).update({
                    is_active: 1,
                    filename: filename,
                    title: title,
                    file_size: file.size,
                    sha256: sha256,
                    uploaded_by: req.user.id
                });

                results.push({name: original, size: file.size, saved: true, message: 'Saved. This filename belonged to a removed PDF; that record is back on the bookshelf with this file.'});

            } else {

                await DB(PDFS).insert({
                    uuid: CRYPTO.randomUUID(),
                    filename: filename,
                    title: title,
                    file_size: file.size,
                    sha256: sha256,
                    uploaded_by: req.user.id
                });

                results.push({name: original, size: file.size, saved: true, message: 'Saved.'});
            }

        } catch (error) {

            /* a failure after the move would strand a file no row points at */
            if (published) {
                await FS.promises.unlink(destination).catch(function () {});
            }

            if (error.status === undefined) {
                LOGGER.module().error(`ERROR: [/uploads/controller (upload)] ${original}: ${error.message}`);
            }

            results.push({name: original, size: file.size, saved: false, message: result_message(error)});
            FS.promises.unlink(file.path).catch(function () {});
        }
    }

    for (const name of (req.rejected_files || [])) {
        const original = Buffer.from(name, 'latin1').toString('utf8');
        results.push({name: original, size: 0, saved: false, message: 'Not a PDF file.'});
    }

    if (results.length === 0) {
        results.push({name: 'No files received', size: 0, saved: false, message: 'Choose at least one PDF (up to 10 files, 100 MB each).'});
    }

    LOGGER.module().info(`uploads: ${results.filter(r => r.saved).length}/${results.length} saved by user ${req.user.id}`);
    res.render('fragments/upload-results', view_locals(req, {results: results}));
};

/**
 * Multer error handler - answers with the same result fragment shape
 */
exports.upload_error = function (error, req, res, _next) {

    LOGGER.module().error('ERROR: [/uploads/controller (upload_error)] ' + error.message);

    const message = error.code === 'LIMIT_FILE_SIZE'
        ? 'File exceeds the 100 MB limit.'
        : 'Upload failed: ' + error.message;

    res.status(400).render('fragments/upload-results', view_locals(req, {
        results: [{name: 'Upload rejected', size: 0, saved: false, message: message}]
    }));
};

/* exported for tests */
exports._sanitize_filename = sanitize_filename;
exports._is_pdf = is_pdf;
exports._filename_problem = filename_problem;
exports._derive_title = derive_title;
exports._result_message = result_message;
