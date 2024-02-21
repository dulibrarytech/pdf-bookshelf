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
const TOKEN = require('../libs/tokens');
const USER = require('../users/model');
const API_PATH = '/bookshelf';

exports.sso = function (req, res) {

    const sso_host = req.body.HTTP_HOST;
    const username = req.body.employeeID;
    const pdf = req.query.pdf;

    if (sso_host === CONFIG.ssoHost && username !== undefined) {

        let token = TOKEN.create(username);
        token = encodeURIComponent(token);

        // DU community
        if (pdf !== 'undefined') {
            res.redirect(API_PATH + '/viewer?pdf=' + pdf + '&t=' + token);
            return false;
        }

        // DU staff - check if staff user has access to bookshelf dashboard
        USER.check_auth_user(username, function (result) {

            if (result.auth === true) {

                res.redirect(API_PATH + '/dashboard/home?t=' + token + '&uid=' + result.data);

            } else {

                // TODO: redirect to error page?
                res.status(401).send({
                    message: 'Application authenticate failed. You do not have access to this application.'
                });
            }
        });
    }
};

exports.logout = function (req, res) {
    res.render('logout', {
        host: CONFIG.host,
        appname: CONFIG.appName,
        appversion: CONFIG.appVersion,
        organization: CONFIG.organization,
        redirect: CONFIG.ssoLogoutUrl
    });
};
