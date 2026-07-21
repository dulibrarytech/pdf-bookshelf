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

const PATH = require('path');
const CONFIG = require('../config/config');
const LOGGER = require('../libs/log4');
const MODEL = require('./model');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

        res.sendFile(file, {
            root: PATH.resolve(CONFIG.storage_path),
            headers: {'Content-Type': 'application/pdf'},
            dotfiles: 'deny'
        }, function (error) {

            if (error) {

                LOGGER.module().error('ERROR: [/pdfs/controller (get_pdf)] ' + file + ' ' + error.message);

                if (!res.headersSent) {
                    res.status(404).send({message: 'Resource not found.'});
                }

                return;
            }

            MODEL.increment_hits(record.id);
        });

    } catch (error) {
        LOGGER.module().error('ERROR: [/pdfs/controller (get_pdf)] ' + error.message);

        if (!res.headersSent) {
            res.status(500).send({message: 'An unexpected error occurred.'});
        }
    }
};
