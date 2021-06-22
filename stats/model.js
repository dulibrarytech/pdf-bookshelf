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

const DB = require('../config/db')(),
    LOGGER = require('../libs/log4'),
    STATS = 'tbl_data';

exports.get_stats = function (req, callback) {

    async function get_total_pdf_count() {
        return await DB(STATS).count('id as total_pdf_count');
    }

    async function get_most_hits() {
        return await DB(STATS).max('hits as most_hits').limit(1);
    }

    async function get_filename(hits) {

        return await DB(STATS)
            .select('id', 'filename', 'hits')
            .where({
                hits: hits[0].most_hits
            });
    }

    async function get_total_hits() {
        return await DB(STATS).sum('hits as hits');
    }

    (async function () {

        try {

            let pdf = await get_total_pdf_count();
            let hits = await get_most_hits();
            let filename = await get_filename(hits);
            let total_hits = await get_total_hits();

            if (filename.length === 0) {
                filename.push({filename: 'none.pdf'});
            } else {
                filename = filename[0].filename + '.pdf';
            }

            if (total_hits[0].hits === null) {
                total_hits = 0;
            } else {
                total_hits = total_hits[0].hits;
            }

            let results = {
                total_pdfs: pdf[0].total_pdf_count,
                most_accessed_file: filename,
                total_hits: total_hits,
            };

            callback({
                status: 200,
                data: results,
                message: 'Stats retrieved.'
            });

        } catch (error) {
            LOGGER.module().error('ERROR: [/stats/model (get_stats)] Unable to get stats. ' + error);
        }

    })();
};