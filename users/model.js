/**

 Copyright 2021 University of Denver

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

const LOGGER = require('../libs/log4');
const DB =require('../config/db')();
const USERS = 'tbl_users';
const VALIDATOR = require('validator');

/**
 * Gets all users
 * @param req
 * @param callback
 * @returns {boolean}
 */
exports.get_users = function (req, callback) {

    if (req.query.id !== undefined && req.query.id.length !== 0) {

        try {

            if (!VALIDATOR.isNumeric(req.query.id)) {

                callback({
                    status: 400,
                    message: 'Bad Request.'
                });

                return false;
            }

            get_user(req, function (user) {
                callback(user);
            });

            return false;

        } catch (error) {
            LOGGER.module().error('ERROR: [/users/model module (get_users)] unable to get user ' + error.message);
        }
    }

    DB(USERS)
        .select(
        'tbl_users.id',
        'tbl_users.du_id',
        'tbl_users.email',
        'tbl_users.first_name',
        'tbl_users.last_name',
        'tbl_users.is_active',
        'tbl_users.created'
    )
        .then(function (data) {
            callback({
                status: 200,
                data: data,
                message: 'Users retrieved.'
            });
        })
        .catch(function (error) {
            LOGGER.module().error('ERROR: [/users/model module (get_users)] unable to get users ' + error.message);
        });
};

/**
 * Gets one user
 * @param req
 * @param callback
 */
const get_user = function (req, callback) {

    let id = req.query.id;
    delete req.query;

    if (id === undefined || id.length === 0) {

        callback({
            status: 400,
            message: 'Bad Request.'
        });
    }

    if (!VALIDATOR.isNumeric(id)) {

        callback({
            status: 400,
            message: 'Bad Request.'
        });

        return false;
    }

    DB(USERS)
        .select('id', 'du_id', 'email', 'first_name', 'last_name', 'is_active', 'created')
        .where({
            id: parseInt(id)
        })
        .then(function (data) {

            callback({
                status: 200,
                data: data,
                message: 'User retrieved.'
            });
        })
        .catch(function (error) {
            LOGGER.module().error('ERROR: [/users/model module (get_user)] unable to get user ' + error.message);
        });
};

/**
 * Checks user access
 * @param username
 * @param callback
 */
exports.check_auth_user = function (username, callback) {

    try {

        if (!VALIDATOR.isNumeric(username) || username === undefined) {

            callback({
                status: 403,
                message: 'You do not have access to this resource.'
            });

            return false;
        }

        if (username.length > 10) {

            callback({
                status: 400,
                message: 'Bad Request.'
            });

            return false;
        }

        DB(USERS)
        .select('id')
        .where({
            du_id: username,
            is_active: 1
        })
        .then(function (data) {

            if (data.length === 1) {
                callback({
                    auth: true,
                    data: parseInt(data[0].id)
                });
            } else {
                callback({
                    auth: false,
                    data: []
                });
            }
        })
        .catch(function (error) {
            LOGGER.module().error('ERROR: [/users/model module (check_auth_user)] unable to check auth ' + error.message);
        });

    } catch (error) {
        LOGGER.module().error('ERROR: [/users/model module (check_auth_user)] unable to check auth ' + error.message);
    }
};

/**
 * Gets user data
 * @param username
 * @param callback
 */
exports.get_auth_user_data = function (username, callback) {

    try {

        if (!VALIDATOR.isNumeric(username) || username === undefined) {

            callback({
                status: 403,
                message: 'You do not have access to this resource.'
            });

            return false;
        }

        if (username.length > 10) {

            callback({
                status: 400,
                message: 'Bad Request.'
            });

            return false;
        }

        DB(USERS)
        .select('id', 'du_id', 'email', 'first_name', 'last_name')
        .where({
            du_id: username,
            is_active: 1
        })
        .then(function (data) {

            if (data.length === 1) {
                callback({
                    data: data
                });
            } else {
                callback({
                    data: []
                });
            }
        })
        .catch(function (error) {
            LOGGER.module().error('ERROR: [/users/model module (get_auth_user_data)] unable to get user data ' + error.message);
        });

    } catch (error) {
        LOGGER.module().error('ERROR: [/users/model module (get_auth_user_data)] unable to get user data ' + error.message);
    }
};

/**
 * Updates user data
 * @param req
 * @param callback
 */
exports.update_user = function (req, callback) {

    try {

        let User = req.body,
            id = User.id;
        delete req.body;

        if (id.length === 0) {

            callback({
                status: 400,
                message: 'Bad Request.'
            });
        }

        if (!VALIDATOR.isNumeric(id)) {

            callback({
                status: 400,
                message: 'Bad Request.'
            });

            return false;
        }

        delete User.id;

        DB(USERS)
        .where({
            id: parseInt(id)
        })
        .update({
            email: User.email,
            first_name: User.first_name,
            last_name: User.last_name,
            is_active: User.is_active
        })
        .then(function (data) {

            callback({
                status: 201,
                message: 'User updated.'
            });

            return null;
        })
        .catch(function (error) {
            LOGGER.module().error('ERROR: [/users/model module (update_user)] unable to update user record ' + error.message);
        });

    } catch (error) {
        LOGGER.module().error('ERROR: [/users/model module (update_user)] unable to update user record ' + error.message);
    }
};

/**
 * Saves user data
 * @param req
 * @param callback
 */
exports.save_user = function (req, callback) {

    try {

        let userObj = req.body;
        let user = Object.values(userObj);
        delete req.body;

        if (!VALIDATOR.isNumeric(userObj.du_id)) {

            callback({
                status: 403,
                message: 'You do not have access to this resource.'
            });

            return false;
        }

        if (userObj.du_id.length > 10) {

            callback({
                status: 400,
                message: 'Bad Request.'
            });

            return false;
        }

        if (user.indexOf(null) !== -1 || user.indexOf('') !== -1) {
            callback({
                status: 200,
                message: 'Please fill in all required fields.',
                data: userObj
            });

            return false;
        }

        DB(USERS)
        .count('du_id as du_id')
        .where('du_id', userObj.du_id)
        .then(function (data) {

            if (data[0].du_id === 1) {
                callback({
                    status: 200,
                    message: 'User is already in the system.'
                });

                return false;
            }

            DB(USERS)
            .insert(userObj)
            .then(function (data) {
                callback({
                    status: 201,
                    message: 'User created.'
                });
            })
            .catch(function (error) {
                LOGGER.module().error('ERROR: [/users/model module (save_user)] unable to get user data ' + error.message);
            });
        })
        .catch(function (error) {
            LOGGER.module().error('ERROR: [/users/model module (save_user)] unable to save user data ' + error.message);
        });

        return false;

    } catch (error) {
        LOGGER.module().error('ERROR: [/users/model module (save_user)] unable to save user data ' + error.message);
    }
};

/**
 * Deletes user data
 * @param req
 * @param callback
 */
exports.delete_user = function (req, callback) {

    try {

        let id = req.query.id;

        if (id === undefined || id.length === 0) {

            callback({
                status: 400,
                message: 'Bad Request.'
            });

            return false;
        }

        if (!VALIDATOR.isNumeric(id)) {

            callback({
                status: 400,
                message: 'Bad Request.'
            });

            return false;
        }

        DB(USERS)
        .where({
            id: parseInt(id)
        })
        .del()
        .then(function (data) {

            callback({
                status: 204,
                message: 'User deleted.'
            });

            return null;
        })
        .catch(function (error) {
            LOGGER.module().fatal('FATAL: [/users/model module (delete_user)] unable to delete user record ' + error.message);
        });

    } catch (error) {
        LOGGER.module().fatal('FATAL: [/users/model module (delete_user)] unable to delete user record ' + error.message);
    }
};