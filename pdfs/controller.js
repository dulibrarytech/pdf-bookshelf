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

const PATH = require('path');
const CONFIG = require('../config/config');
const LOGGER = require('../libs/log4');
const MODEL = require('./model');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * True when a request represents somebody opening the document, rather than
 * one of the ranged follow-ups a PDF reader makes for that same view.
 *
 * A reader fetches a document in several HTTP requests: one with no Range
 * header for the document itself, then ranged requests for the pieces it
 * wants. Counting all of them made "Requests" track file size instead of
 * readership - measured, one view of a 12 MB document scored 4 while a 1 MB
 * document scored 2, so "Most Requested File" ranked the biggest file rather
 * than the most-read one.
 *
 * This also restores the meaning of the counts migrated from v1: v1 served
 * PDFs with a piped read stream and never advertised Accept-Ranges, so no
 * client could range-fetch and every v1 hit was one view. Counting only
 * un-ranged requests keeps the whole column on that one scale.
 *
 * @param req
 */
function is_document_view(req) {
    /* Express answers HEAD from the GET handler; a HEAD is not a read */
    return req.method === 'GET' && req.headers.range === undefined;
}

/**
 * Makes a stored filename safe to place inside a quoted header parameter.
 * Uploads are sanitized on the way in, but v1 rows predate that, so nothing
 * that could terminate the quoted string or the header line gets through.
 * @param filename
 */
function header_filename(filename) {
    return String(filename).replace(/[^\w .-]/g, '_').slice(0, 200);
}

/**
 * Resolves a ?pdf=/route param that may be a v2 uuid or a legacy v1 filename
 * @param value
 * @returns {Promise<object|undefined>} tbl_pdfs record
 */
async function resolve_record(value) {

    if (typeof value !== 'string' || value.length === 0 || value.length > 500) {
        return undefined;
    }

    if (UUID_RE.test(value)) {
        return MODEL.get_by_uuid(value.toLowerCase());
    }

    /* legacy v1 links used the raw filename (without .pdf) */
    return MODEL.get_by_filename(value.replace(/\.pdf$/i, ''));
}

/**
 * GET /viewer?pdf=<uuid|legacy filename>
 */
exports.get_viewer = async function (req, res) {

    try {

        const record = await resolve_record(req.query.pdf);

        if (record === undefined) {
            res.status(404).render('error', {message: 'PDF not found.'});
            return;
        }

        res.render('viewer', {
            app_path: CONFIG.app_path,
            appname: CONFIG.app_name,
            title: record.title || record.filename,
            uuid: record.uuid
        });

    } catch (error) {
        LOGGER.module().error('ERROR: [/pdfs/controller (get_viewer)] ' + error.message);
        res.status(500).render('error', {message: 'Unable to open the viewer.'});
    }
};

/**
 * GET /pdf/:id - streams the file.
 *
 * The database row IS the allowlist: unknown ids 404 before any filesystem
 * access, and sendFile's root option refuses traversal - the two v1 holes
 * (path traversal + crash on missing file) die here.
 *
 * Range requests are served (readers need them to page through a large
 * document) but only un-ranged requests count as a view - see is_document_view.
 */
exports.get_pdf = async function (req, res) {

    try {

        const record = await resolve_record(req.params.id);

        if (record === undefined) {
            res.status(404).send({message: 'Resource not found.'});
            return;
        }

        /* legacy filename hit - bounce to the canonical uuid URL */
        if (!UUID_RE.test(req.params.id)) {
            res.redirect(301, `${CONFIG.app_path}/pdf/${record.uuid}`);
            return;
        }

        const file = record.filename + '.pdf';

        /*
         * Counted here rather than in the sendFile callback, which fires only
         * on a completed transfer: a reader who opens a large document and
         * closes the tab part-way still read it. This is also what v1 did -
         * it bumped the counter before opening the stream.
         */
        if (is_document_view(req)) {
            MODEL.increment_hits(record.id);
        }

        res.sendFile(file, {
            root: PATH.resolve(CONFIG.storage_path),
            headers: {
                'Content-Type': 'application/pdf',
                /*
                 * inline = render in the viewer, don't prompt. The filename is
                 * what pdf.js titles the tab with and what a browser proposes
                 * on save - without it both fall back to the last URL segment,
                 * which is the uuid.
                 */
                'Content-Disposition': `inline; filename="${header_filename(record.filename)}.pdf"`
            },
            dotfiles: 'deny'
        }, function (error) {

            if (error) {

                LOGGER.module().error('ERROR: [/pdfs/controller (get_pdf)] ' + file + ' ' + error.message);

                if (!res.headersSent) {
                    res.status(404).send({message: 'Resource not found.'});
                }
            }
        });

    } catch (error) {
        LOGGER.module().error('ERROR: [/pdfs/controller (get_pdf)] ' + error.message);

        if (!res.headersSent) {
            res.status(500).send({message: 'An unexpected error occurred.'});
        }
    }
};

/* exported for tests */
exports._is_document_view = is_document_view;
