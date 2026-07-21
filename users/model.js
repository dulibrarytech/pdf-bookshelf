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

exports.create = async function (body) {

    const user = validate_profile(body);
    user.du_id = validate_du_id(body);

    const existing = await DB(USERS).select('id').where({du_id: user.du_id}).first();

    if (existing !== undefined) {
        throw new ConflictError('A user with this DU ID already exists.');
    }

    const [id] = await DB(USERS).insert(user);
    return exports.get(id);
};

/**
 * Updates profile fields only - the DU ID is the SSO identity key and is
 * immutable after creation (any du_id in the body is ignored)
 */
exports.update = async function (id, body) {

    const user = validate_profile(body);
    const updated = await DB(USERS).where({id: parseInt(id, 10) || 0}).update(user);

    if (updated === 0) {
        throw new NotFoundError('User not found.');
    }

    return exports.get(id);
};

/**
 * Soft delete / reactivate (v1 hard-deleted rows)
 * @param id
 * @param active
 */
exports.set_active = async function (id, active) {

    const updated = await DB(USERS).where({id: parseInt(id, 10) || 0}).update({is_active: active ? 1 : 0});

    if (updated === 0) {
        throw new NotFoundError('User not found.');
    }

    return exports.get(id);
};
