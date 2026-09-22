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
const FORMAT = require('../libs/format');
const LOGGER = require('../libs/log4');
const { ValidationError } = require('../libs/errors');

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
 * True when an admin is taking their own admin role away. Pure, for tests.
 * @param actor req.user - the signed-in admin making the request
 * @param target_id the user being edited
 * @param requested_role the role the form is asking for
 */
function is_self_demotion(actor, target_id, requested_role) {

    return actor !== undefined
        && actor.role === 'admin'
        && actor.id === target_id
        && requested_role !== 'admin';
}

/**
 * Answers a row-shaped failure; the users table has six columns. A refusal
 * the model raised (validation, conflict, not found) is shown as it is;
 * anything else is logged and replaced by the fallback, so a database error
 * never reaches the screen. Rendered through a view so the text is escaped.
 * @param res
 * @param error
 * @param fallback shown in place of an unexpected error's own message
 */
function error_row(res, error, fallback) {

    const status = error.status || 500;

    if (status === 500) {
        LOGGER.module().error('ERROR: [/users/controller] ' + error.message);
    }

    res.status(status).render('fragments/message-row', {
        colspan: 6,
        css: 'text-danger',
        message: status === 500 ? fallback : error.message
    });
}

exports.get_users_page = async function (req, res) {

    try {
        const users = await MODEL.list();
        res.render('dashboard-users', view_locals(req, {users: users, active: 'users', title: 'Users'}));
    } catch (error) {
        LOGGER.module().error('ERROR: [/users/controller (get_users_page)] ' + error.message);
        res.status(500).render('error', {message: 'Unable to load users.'});
    }
};

/**
 * POST /dashboard/users - creates a user, returns the new display row
 */
exports.create_user = async function (req, res) {

    try {

        const created = await MODEL.create(req.body);
        /* redirect the swap into the table; HX-Trigger resets the add form */
        res.set('HX-Retarget', '#user-rows');
        res.set('HX-Reswap', 'beforeend');
        res.set('HX-Trigger', 'user-saved');
        res.render('fragments/user-row', view_locals(req, {row: created}));

    } catch (error) {

        const status = error.status || 500;

        if (status === 500) {
            LOGGER.module().error('ERROR: [/users/controller (create_user)] ' + error.message);
        }

        res.status(status).render('fragments/alert', {message: status === 500 ? 'Unable to save the user.' : error.message});
    }
};

exports.get_user_row = async function (req, res) {

    try {
        const row = await MODEL.get(req.params.id);
        res.render('fragments/user-row', view_locals(req, {row: row}));
    } catch (error) {
        error_row(res, error, 'Unable to load the user.');
    }
};

exports.get_user_edit_row = async function (req, res) {

    try {
        const row = await MODEL.get(req.params.id);
        res.render('fragments/user-row-edit', view_locals(req, {row: row}));
    } catch (error) {
        error_row(res, error, 'Unable to load the edit form.');
    }
};

/**
 * PUT /dashboard/users/:id - saves changes, returns the display row
 */
exports.update_user = async function (req, res) {

    try {

        /* your own admin role is not yours to drop; the model's last-admin guard is the hard safety net */
        if (is_self_demotion(req.user, parseInt(req.params.id, 10) || 0, String(req.body.role || '').trim())) {
            throw new ValidationError('You cannot remove your own administrator role. Ask another administrator to change it.');
        }

        const row = await MODEL.update(req.params.id, req.body);
        res.render('fragments/user-row', view_locals(req, {row: row}));

    } catch (error) {
        error_row(res, error, 'Unable to save changes.');
    }
};

/**
 * DELETE /dashboard/users/:id - soft delete; POST /:id/reactivate undoes it
 */
exports.deactivate_user = async function (req, res) {

    try {

        /* an admin locking themselves out is one click away - refuse */
        if (req.user.id === (parseInt(req.params.id, 10) || 0)) {
            throw new ValidationError('You cannot deactivate your own account.');
        }

        const row = await MODEL.set_active(req.params.id, false);
        res.render('fragments/user-row', view_locals(req, {row: row}));

    } catch (error) {
        error_row(res, error, 'Unable to deactivate the user.');
    }
};

exports.reactivate_user = async function (req, res) {

    try {
        const row = await MODEL.set_active(req.params.id, true);
        res.render('fragments/user-row', view_locals(req, {row: row}));
    } catch (error) {
        error_row(res, error, 'Unable to reactivate the user.');
    }
};

/* exported for tests */
exports._is_self_demotion = is_self_demotion;
