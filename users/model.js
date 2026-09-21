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

const VALIDATOR = require('validator');
const DB = require('../config/db');
const { ValidationError, ConflictError, NotFoundError } = require('../libs/errors');

const USERS = 'tbl_users';
const FIELDS = ['id', 'du_id', 'email', 'first_name', 'last_name', 'role', 'is_active', 'created'];
const ROLES = ['admin', 'staff'];

/**
 * Validates and normalizes the editable profile fields (throws ValidationError)
 * @param body
 * @returns {{email, first_name, last_name, role}}
 */
function validate_profile(body) {

    const email = String(body.email || '').trim().toLowerCase();
    const first_name = String(body.first_name || '').trim();
    const last_name = String(body.last_name || '').trim();
    const role = String(body.role || 'staff').trim();

    if (!VALIDATOR.isEmail(email) || email.length > 255) {
        throw new ValidationError('A valid email address is required.');
    }

    if (first_name.length === 0 || first_name.length > 255 || last_name.length === 0 || last_name.length > 255) {
        throw new ValidationError('First and last name are required.');
    }

    if (!ROLES.includes(role)) {
        throw new ValidationError('Role must be admin or staff.');
    }

    return {email, first_name, last_name, role};
}

/**
 * Validates the DU ID (create only - the identity key is immutable after that)
 * @param body
 * @returns {string}
 */
function validate_du_id(body) {

    const du_id = String(body.du_id || '').trim();

    if (!VALIDATOR.isNumeric(du_id) || du_id.length === 0 || du_id.length > 10) {
        throw new ValidationError('DU ID must be numeric (10 digits max).');
    }

    return du_id;
}

exports.list = function () {
    return DB(USERS).select(FIELDS).orderBy('last_name', 'asc');
};

exports.get = async function (id) {

    const user = await DB(USERS).select(FIELDS).where({id: parseInt(id, 10) || 0}).first();

    if (user === undefined) {
        throw new NotFoundError('User not found.');
    }

    return user;
};

/**
 * Turns the database's refusal of a second row for a DU ID into the answer
 * the pre-check gives. The unique index on du_id (migration 20260921000003)
 * is what actually keeps one row per person; the SELECT in create() only
 * spares the common case a round trip to a failing INSERT. Two administrators
 * adding the same DU ID in the same instant both pass that check, and the
 * second INSERT then fails on the index - a 409 for them, not a 500.
 * @param error thrown by the INSERT
 * @returns {Error} a ConflictError for a duplicate key, otherwise the error as given
 */
function as_conflict(error) {

    return error.code === 'ER_DUP_ENTRY'
        ? new ConflictError('A user with this DU ID already exists.')
        : error;
}

exports.create = async function (body) {

    const user = validate_profile(body);
    user.du_id = validate_du_id(body);

    const existing = await DB(USERS).select('id').where({du_id: user.du_id}).first();

    if (existing !== undefined) {
        throw new ConflictError('A user with this DU ID already exists.');
    }

    let id;

    try {
        [id] = await DB(USERS).insert(user);
    } catch (error) {
        throw as_conflict(error);
    }

    return exports.get(id);
};

/**
 * True when taking admin away from this user would leave nobody able to
 * administer the app. Pure, so the rule is testable without a database.
 * @param id the user being demoted or deactivated
 * @param active_admin_ids ids of every currently active admin
 */
function is_last_active_admin(id, active_admin_ids) {
    return active_admin_ids.length === 1 && active_admin_ids[0] === id;
}

/**
 * Refuses a change that would leave the app with no active administrator.
 *
 * There is no in-app way back from that: the Users and Utilities screens are
 * admin-gated, so recovering means editing tbl_users by hand. Runs inside the
 * caller's transaction and locks every active admin row, so two admins
 * demoting each other at the same moment cannot both read "someone else is
 * still an admin" and both commit. Rows are locked in id order - one query,
 * one order, so concurrent guards queue instead of deadlocking.
 *
 * @param trx
 * @param id the user being changed
 * @param action wording for the message
 */
async function guard_last_admin(trx, id, action) {

    const admins = await trx(USERS)
        .select('id')
        .where({role: 'admin', is_active: 1})
        .orderBy('id', 'asc')
        .forUpdate();

    if (is_last_active_admin(id, admins.map((row) => row.id))) {
        throw new ConflictError(`This is the only active administrator. Give another user the admin role before ${action}.`);
    }
}

/**
 * Updates profile fields only - the DU ID is the SSO identity key and is
 * immutable after creation (any du_id in the body is ignored)
 */
exports.update = async function (id, body) {

    const user_id = parseInt(id, 10) || 0;
    const user = validate_profile(body);

    await DB.transaction(async function (trx) {

        if (user.role !== 'admin') {
            await guard_last_admin(trx, user_id, 'changing this one');
        }

        const updated = await trx(USERS).where({id: user_id}).update(user);

        if (updated === 0) {
            throw new NotFoundError('User not found.');
        }
    });

    return exports.get(user_id);
};

/**
 * Soft delete / reactivate (v1 hard-deleted rows)
 * @param id
 * @param active
 */
exports.set_active = async function (id, active) {

    const user_id = parseInt(id, 10) || 0;

    await DB.transaction(async function (trx) {

        if (active !== true) {
            await guard_last_admin(trx, user_id, 'deactivating this one');
        }

        const updated = await trx(USERS).where({id: user_id}).update({is_active: active ? 1 : 0});

        if (updated === 0) {
            throw new NotFoundError('User not found.');
        }
    });

    return exports.get(user_id);
};

/* exported for tests */
exports._is_last_active_admin = is_last_active_admin;
exports._validate_profile = validate_profile;
exports._validate_du_id = validate_du_id;
exports._as_conflict = as_conflict;
