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

const FS = require('node:fs');
const PATH = require('node:path');
const MULTER = require('multer');
const CONFIG = require('../config/config');
const CONTROLLER = require('./controller');
const MIDDLEWARE = require('../auth/middleware');
const RATE_LIMIT = require('../libs/rate_limit');

/* staging area - files move into storage/ only after validation */
const TMP = PATH.join(PATH.resolve(CONFIG.storage_path), '.tmp');

const UPLOAD = MULTER({
    storage: MULTER.diskStorage({
        destination: function (req, file, callback) {
            FS.mkdirSync(TMP, {recursive: true});
            callback(null, TMP);
        }
        /* no filename option: multer generates a random staging name */
    }),
    fileFilter: function (req, file, callback) {

        /* both the extension and the mimetype must say PDF */
        if (!/\.pdf$/i.test(file.originalname) || file.mimetype !== 'application/pdf') {

            /* surfaced in the result fragment instead of vanishing silently */
            req.rejected_files = req.rejected_files || [];
            req.rejected_files.push(file.originalname);
            return callback(null, false);
        }

        return callback(null, true);
    },
    limits: {
        fileSize: 104857600, /* 100 MB per file (v1 allowed 1 GB) */
        files: 10
    }
});

module.exports = function (app) {

    app.route(CONFIG.app_path + '/dashboard/upload')
        .get(MIDDLEWARE.require_dashboard(), CONTROLLER.get_upload_page);

    app.route(CONFIG.app_path + '/dashboard/uploads')
        .post(
            MIDDLEWARE.require_dashboard(),
            RATE_LIMIT({window_ms: 60000, max: 20}),
            UPLOAD.array('pdfs', 10),
            CONTROLLER.upload
        );

    app.use(CONFIG.app_path + '/dashboard/uploads', CONTROLLER.upload_error);
};
