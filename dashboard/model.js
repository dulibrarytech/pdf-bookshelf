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
const PDFS = 'tbl_pdfs';

/**
 * Gets dashboard stats (total pdfs / most requested / total requests)
 */
exports.get_stats = async function () {

    const [total] = await DB(PDFS).where({is_active: 1}).count('id as total_pdfs');
    const [top] = await DB(PDFS).where({is_active: 1}).orderBy('hits', 'desc').limit(1).select('filename', 'hits');
    const [hits] = await DB(PDFS).where({is_active: 1}).sum('hits as total_hits');

    return {
        total_pdfs: total.total_pdfs,
        most_accessed_file: top === undefined ? 'none' : `${top.filename}.pdf (${top.hits} requests)`,
        total_hits: hits.total_hits === null ? 0 : Number(hits.total_hits)
    };
};
