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

/**
 * Answers with a one-cell message row for the bookshelf table's fragment
 * endpoints. The table has five columns - title, size, requests, added,
 * actions. Rendered through a view so the text is escaped on the way out:
 * controllers build no markup from strings (a guard test keeps it so).
 * @param res
 * @param status
 * @param message
 */
function message_row(res, status, message) {
    res.status(status).render('fragments/message-row', {colspan: 5, message: message});
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
        res.status(500).render('fragments/alert', {message: 'Unable to load the bookshelf table.'});
    }
};

/**
 * GET /dashboard/pdfs/:uuid/row - HTMX fragment: single display row (edit cancel)
 */
exports.get_pdf_row = async function (req, res) {

    try {

        const record = await PDFS.get_by_uuid(req.params.uuid);

        if (record === undefined) {
            message_row(res, 404, 'Record not found.');
            return;
        }

        res.render('fragments/pdf-row', view_locals(req, {row: record}));

    } catch (error) {
        LOGGER.module().error('ERROR: [/dashboard/controller (get_pdf_row)] ' + error.message);
        message_row(res, 500, 'Unable to load the row.');
    }
};

/**
 * GET /dashboard/pdfs/:uuid/edit - HTMX fragment: inline title edit form
 */
exports.get_pdf_edit_row = async function (req, res) {

    try {

        const record = await PDFS.get_by_uuid(req.params.uuid);

        if (record === undefined) {
            message_row(res, 404, 'Record not found.');
            return;
        }

        res.render('fragments/pdf-row-edit', view_locals(req, {row: record}));

    } catch (error) {
        LOGGER.module().error('ERROR: [/dashboard/controller (get_pdf_edit_row)] ' + error.message);
        message_row(res, 500, 'Unable to load the edit form.');
    }
};

/**
 * PUT /dashboard/pdfs/:uuid - saves title, returns the updated display row
 */
exports.update_pdf = async function (req, res) {

    try {

        const title = typeof req.body.title === 'string' ? req.body.title.trim().substring(0, 500) : '';

        if (title.length === 0) {
            message_row(res, 400, 'Title is required.');
            return;
        }

        const updated = await PDFS.update_title(req.params.uuid, title);

        if (updated === 0) {
            message_row(res, 404, 'Record not found.');
            return;
        }

        const record = await PDFS.get_by_uuid(req.params.uuid);
        res.render('fragments/pdf-row', view_locals(req, {row: record}));

    } catch (error) {
        LOGGER.module().error('ERROR: [/dashboard/controller (update_pdf)] ' + error.message);
        message_row(res, 500, 'Unable to save changes.');
    }
};

/**
 * DELETE /dashboard/pdfs/:uuid - soft delete (admin)
 *
 * The record and its file both stay so it can be restored. With "Show
 * removed" on (the button includes the filter, and htmx puts DELETE
 * parameters in the query string) the row re-renders as removed, Restore
 * and all; otherwise it disappears from the list.
 */
exports.deactivate_pdf = async function (req, res) {

    try {

        const record = await PDFS.get_by_uuid(req.params.uuid);

        if (record === undefined) {
            message_row(res, 404, 'Record not found.');
            return;
        }

        await PDFS.deactivate(req.params.uuid);

        if (req.query.removed === '1') {
            res.render('fragments/pdf-row', view_locals(req, {row: Object.assign({}, record, {is_active: 0})}));
            return;
        }

        /* row disappears; HTMX swaps in nothing */
        res.status(200).send('');

    } catch (error) {
        LOGGER.module().error('ERROR: [/dashboard/controller (deactivate_pdf)] ' + error.message);
        message_row(res, 500, 'Unable to remove the record.');
    }
};

/**
 * POST /dashboard/pdfs/:uuid/restore - undoes a Remove (admin), returns the
 * row as an active record again. Restoring an already-active record is a
 * no-op that still renders it, so a stale page cannot break anything.
 */
exports.restore_pdf = async function (req, res) {

    try {

        await PDFS.reactivate(req.params.uuid);

        const record = await PDFS.get_by_uuid(req.params.uuid);

        if (record === undefined) {
            message_row(res, 404, 'Record not found.');
            return;
        }

        res.render('fragments/pdf-row', view_locals(req, {row: record}));

    } catch (error) {
        LOGGER.module().error('ERROR: [/dashboard/controller (restore_pdf)] ' + error.message);
        message_row(res, 500, 'Unable to restore the record.');
    }
};
