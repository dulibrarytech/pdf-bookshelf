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

exports.get_utils_page = function (req, res) {
    res.render('dashboard-utils', view_locals(req, {active: 'utils', title: 'Utilities'}));
};

/**
 * POST /dashboard/utils/resync - starts a reconciliation in the background,
 * or joins the one running, and answers with the progress fragment that
 * polls for the report. The work used to run inside this request: no guard
 * against two administrators starting it at once, and a runtime that grew
 * with the corpus until it outlived the proxy's patience.
 */
exports.resync = function (req, res) {

    const { job, joined } = MODEL.start(req.user.id);

    if (joined) {
        LOGGER.module().info(`resync: user ${req.user.id} joined the run started by user ${job.started_by}`);
    }

    res.render('fragments/resync-running', view_locals(req, {job: job, joined: joined}));
};

/**
 * GET /dashboard/utils/resync/status - the progress fragment polls this
 * until the run finishes, when the report (or a failure notice) takes its
 * place and the polling stops with it
 */
exports.resync_status = function (req, res) {

    const job = MODEL.status();

    if (job === null) {
        /* a poll from before a restart: the run it was watching is gone */
        res.render('fragments/alert', {message: 'The re-sync was interrupted by a server restart. Run it again.'});
        return;
    }

    if (job.finished_at === null) {
        res.render('fragments/resync-running', view_locals(req, {job: job, joined: false}));
        return;
    }

    if (job.error !== null) {
        res.render('fragments/alert', {message: 'Re-sync failed: see the server log for details.'});
        return;
    }

    res.render('fragments/resync-report', view_locals(req, {report: job.report, took_ms: job.finished_at - job.started_at}));
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
