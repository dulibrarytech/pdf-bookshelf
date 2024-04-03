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

const CONFIG = require('../config/config');
const JWT = require('jsonwebtoken');
const LOGGER = require('../libs/log4');
const API_PATH = '/bookshelf';

/**
 * Creates session token
 * @param username
 * @returns {*}
 */
exports.create = function (username) {

    let tokenData = {
        sub: username,
        iss: CONFIG.tokenIssuer
    };

    return JWT.sign(tokenData, CONFIG.tokenSecret, {
        algorithm: CONFIG.tokenAlgo,
        expiresIn: CONFIG.tokenExpires
    });
};

/**
 * Verifies session token
 * @param req
 * @param res
 * @param next
 */
exports.verify = function (req, res, next) {

    try {

        let token = req.headers['x-access-token'] || req.query.t;
        let pdf = req.params.filename;

        if (token !== undefined) {

            JWT.verify(token, CONFIG.tokenSecret, function (error, decoded) {

                if (error) {

                    LOGGER.module().error('ERROR: [/libs/tokens lib (verify)] unable to verify token ' + error);
                    res.redirect(API_PATH + '/login');
                    return false;
                }

                req.decoded = decoded;
                next();
            });

        } else {
            res.redirect(CONFIG.ssoUrl + '?app_url=' + CONFIG.ssoResponseUrl + '?pdf=' + pdf);
        }

    } catch (error) {
        LOGGER.module().error('ERROR: [/libs/tokens lib (verify)] unable to verify token ' + error.message);
    }
};