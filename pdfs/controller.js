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
 * one of the ranged follow-ups a PDF reader makes for that same view. Only
 * the un-ranged request counts, which keeps the whole "Requests" column on
 * the one-view-per-hit scale the v1 counts were migrated on.
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
 * The database row is the allowlist: unknown ids 404 before any filesystem
 * access, and sendFile's root option refuses traversal. Range requests are
 * served, but only un-ranged requests count as a view - see is_document_view.
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
         * on a completed transfer: a reader who closes the tab part-way
         * still read it.
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
