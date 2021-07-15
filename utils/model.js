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

const CONFIG = require('../config/config'),
    FS = require('fs'),
    PATH = require('path'),
    LOGGER = require('../libs/log4'),
    CACHE = require('../libs/cache'),
    DB = require('../config/db')(),
    DATA = 'tbl_data';

/**
 * Repopulates database
 * @param req
 * @param callback
 */
exports.reload = function (req, callback) {

    /**
     * Gets all pdf file names
     */
    function get_pdf_filenames() {

        const dir = './storage/'
        const files = FS.readdirSync(dir)
        const file_arr = [];

        for (const file of files) {
            const stat = FS.lstatSync(PATH.join(dir, file))
            file_arr.push({
                filename: file.replace('.pdf', ''),
                file_size: stat.size
            });
        }

        return file_arr;
    }

    let files = get_pdf_filenames();
    let chunkSize = files.length;

    DB.batchInsert(DATA, files, chunkSize)
        .then(function (data) {

            if (data.length === 0) {
                LOGGER.module().fatal('FATAL: [/utils/model (reload)] unable to save data');
                throw 'FATAL: [/utils/model (reload)] unable to save data';
            }

            callback({
                status: 200
            });

            return null;
        })
        .catch(function (error) {
            LOGGER.module().fatal('FATAL: [/libs/transfer-ingest lib (save_transfer_records)] unable to save queue data');
            throw 'FATAL: [/libs/transfer-ingest lib (save_transfer_records)] unable to save queue data' + error;
        });
};

/**
 * Creates single record
 * @param req
 * @param callback
 */
exports.load_pdf = function (req, callback) {

    let file = req.query.file;

    /**
     * Gets pdf file name
     */
    function get_pdf_filename() {

        const dir = './storage/'

        try {

            const stat = FS.lstatSync(PATH.join(dir, file));

            return {
                filename: file.replace('.pdf', ''),
                file_size: stat.size
            }

        } catch(error) {
            throw 'FATAL: [/utils/model (load_pdf)] unable to get filename ' + error;
        }
    }

    let record = get_pdf_filename();

    DB(DATA)
        .insert(record)
        .then(function (data) {

            if (data.length === 0) {
                LOGGER.module().fatal('FATAL: [/libs/transfer-ingest lib (save_transfer_records)] unable to save queue data');
                throw 'FATAL: [/libs/transfer-ingest lib (save_transfer_records)] unable to save queue data';
            }

            callback({
                status: 200
            });

            return null;
        })
        .catch(function (error) {
            LOGGER.module().fatal('FATAL: [/libs/transfer-ingest lib (save_transfer_records)] unable to save queue data');
            throw 'FATAL: [/libs/transfer-ingest lib (save_transfer_records)] unable to save queue data' + error;
        });
};