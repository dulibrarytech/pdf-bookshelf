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

const DB = require('../config/db');
const CONFIG = require('../config/config');
const LOGGER = require('../libs/log4');
const MODEL = require('./model');

function view_locals(req, extra = {}) {

    return Object.assign({
        app_path: CONFIG.app_path,
        appname: CONFIG.app_name,
        appversion: CONFIG.app_version,
        organization: CONFIG.organization,
        user: req.user
    }, extra);
}

exports.default = function (req, res) {
    res.status(200).send({
        info: `${CONFIG.organization} - ${CONFIG.app_name} ${CONFIG.app_version}`
    });
};

exports.get_utils_page = function (req, res) {
    res.render('dashboard-utils', view_locals(req, {active: 'utils', title: 'Utilities'}));
};

/**
 * POST /dashboard/utils/resync - reconciles storage/ with tbl_pdfs (fragment)
 */
exports.resync = async function (req, res) {

    try {

        const report = await MODEL.resync();
        LOGGER.module().info(`resync by user ${req.user.id}: ${JSON.stringify({scanned: report.scanned, added: report.added.length, updated: report.updated.length, missing: report.missing.length})}`);
        res.render('fragments/resync-report', view_locals(req, {report: report}));

    } catch (error) {
        LOGGER.module().error('ERROR: [/utils/controller (resync)] ' + error.message);
        res.status(500).send('<div class="alert alert-danger mb-0">Re-sync failed: ' + 'see the server log for details.</div>');
    }
};

exports.healthcheck = async function (req, res) {

    try {
        await DB.raw('SELECT 1');
        res.status(200).send({status: 'ok', db: 'ok'});
    } catch (error) {
        LOGGER.module().error('ERROR: [/utils/controller (healthcheck)] db unreachable ' + error.message);
        res.status(503).send({status: 'degraded', db: 'unreachable'});
    }
};
