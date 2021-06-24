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

const LOGGER = require('../libs/log4'),
    DB = require('../config/db')(),
    DATA = 'tbl_data';

/**
 * updates pdf hit count
 * @param req
 * @param callback
 */
exports.update_hit_count = function (filename, callback) {

    async function get_hit_count() {
        return DB(DATA).select('hits').where({filename: filename});
    }

    function update_count(count, filename) {

        let updated_count = parseInt(count[0].hits) + 1;

        DB(DATA)
            .where({
                filename: filename
            })
            .update({
                hits: updated_count
            })
            .then(function (data) {})
            .catch(function (error) {
                LOGGER.module().fatal('FATAL: [/pdf/model module (get_pdf)] Unable to log hit ' + error);
                throw 'FATAL: [/pdf/model module (get_pdf)] Unable to log hit ' + error;
            });
    }

    (async function(){
        let record = await get_hit_count();
        update_count(record, filename);
    })()

    callback(filename);
};

/**
 * Gets all stored pdfs
 * @param req
 * @param callback
 */
exports.get_pdfs = function (callback) {

    DB(DATA)
        .select('*')
        .orderBy('id', 'desc')
        .then(function (data) {
            callback({
                status: 200,
                message: 'PDFs retrieved.',
                data: data
            });
        })
        .catch(function (error) {
            LOGGER.module().fatal('FATAL: [/pdf/model module (get_pdfs)] Unable to get pdfs ' + error);
            throw 'FATAL: [/pdf/model module (get_pdfs)] Unable to get pdfs ' + error;
        });
};