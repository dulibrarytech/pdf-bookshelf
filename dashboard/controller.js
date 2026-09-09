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

const CONFIG = require('../config/config');
const MODEL = require('./model');
const PDFS = require('../pdfs/model');
const FORMAT = require('../libs/format');
const LOGGER = require('../libs/log4');

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

exports.get_dashboard_home = async function (req, res) {

    try {

        const stats = await MODEL.get_stats();
        const table = await PDFS.list(req.query);

        res.render('dashboard-home', view_locals(req, {stats, table, active: 'home', title: 'Bookshelf'}));

    } catch (error) {
        LOGGER.module().error('ERROR: [/dashboard/controller (get_dashboard_home)] ' + error.message);
        res.status(500).render('error', {message: 'Unable to load dashboard.'});
    }
};

/**
 * GET /dashboard/pdfs - HTMX fragment: bookshelf table + pagination
 */
exports.get_pdf_table = async function (req, res) {

    try {

        const table = await PDFS.list(req.query);
        res.render('fragments/pdf-table', view_locals(req, {table}));

    } catch (error) {
        LOGGER.module().error('ERROR: [/dashboard/controller (get_pdf_table)] ' + error.message);
        res.status(500).send('<div class="alert alert-danger">Unable to load the bookshelf table.</div>');
    }
};

/**
 * GET /dashboard/pdfs/:uuid/row - HTMX fragment: single display row (edit cancel)
 */
exports.get_pdf_row = async function (req, res) {

    try {

        const record = await PDFS.get_by_uuid(req.params.uuid);

        if (record === undefined) {
            res.status(404).send('<tr><td colspan="6">Record not found.</td></tr>');
            return;
        }

        res.render('fragments/pdf-row', view_locals(req, {row: record}));

    } catch (error) {
        LOGGER.module().error('ERROR: [/dashboard/controller (get_pdf_row)] ' + error.message);
        res.status(500).send('<tr><td colspan="6">Unable to load the row.</td></tr>');
    }
};

/**
 * GET /dashboard/pdfs/:uuid/edit - HTMX fragment: inline title edit form
 */
exports.get_pdf_edit_row = async function (req, res) {

    try {

        const record = await PDFS.get_by_uuid(req.params.uuid);

        if (record === undefined) {
            res.status(404).send('<tr><td colspan="6">Record not found.</td></tr>');
            return;
        }

        res.render('fragments/pdf-row-edit', view_locals(req, {row: record}));

    } catch (error) {
        LOGGER.module().error('ERROR: [/dashboard/controller (get_pdf_edit_row)] ' + error.message);
        res.status(500).send('<tr><td colspan="6">Unable to load the edit form.</td></tr>');
    }
};

/**
 * PUT /dashboard/pdfs/:uuid - saves title, returns the updated display row
 */
exports.update_pdf = async function (req, res) {

    try {

        const title = typeof req.body.title === 'string' ? req.body.title.trim().substring(0, 500) : '';

        if (title.length === 0) {
            res.status(400).send('<tr><td colspan="6">Title is required.</td></tr>');
            return;
        }

        const updated = await PDFS.update_title(req.params.uuid, title);

        if (updated === 0) {
            res.status(404).send('<tr><td colspan="6">Record not found.</td></tr>');
            return;
        }

        const record = await PDFS.get_by_uuid(req.params.uuid);
        res.render('fragments/pdf-row', view_locals(req, {row: record}));

    } catch (error) {
        LOGGER.module().error('ERROR: [/dashboard/controller (update_pdf)] ' + error.message);
        res.status(500).send('<tr><td colspan="6">Unable to save changes.</td></tr>');
    }
};

/**
 * DELETE /dashboard/pdfs/:uuid - soft delete (admin)
 */
exports.deactivate_pdf = async function (req, res) {

    try {

        await PDFS.deactivate(req.params.uuid);
        /* row disappears; HTMX swaps in nothing */
        res.status(200).send('');

    } catch (error) {
        LOGGER.module().error('ERROR: [/dashboard/controller (deactivate_pdf)] ' + error.message);
        res.status(500).send('<tr><td colspan="6">Unable to remove the record.</td></tr>');
    }
};
