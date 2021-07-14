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
    MULTER = require('multer'),
    LOGGER = require('../libs/log4'),
    // TOKEN = require('../libs/tokens'),
    CACHE = require('../libs/cache'),
    STORAGE = './storage',
    DATA = 'tbl_data',
    LIMIT = 1000000000; // 1GB

module.exports = function (app) {

    const FILTER = function(req, file, callback) {

        if (!file.originalname.match(/\.(pdf)$/)) {
            LOGGER.module().error('ERROR: Upload Failed. File is not .pdf');
            callback(null, false);
        }

        callback(null, true);
    };

    let storage = MULTER.diskStorage({
        destination: function (req, file, callback) {
            callback(null, STORAGE);
        },
        filename: function (req, file, callback) {
            let tmp = file.originalname.replace(/\s+/g, '').trim();
            let filename = tmp.replace(/[/\\?%*:|"<>]/g, '-').toLowerCase();
            callback(null, filename);
        }
    });

    let upload = MULTER({ storage: storage, fileFilter: FILTER, limits: { fileSize: LIMIT} });

    app.post('/uploads', upload.any(), function (req, res) {
        console.log(res.req.files);
        let files = res.req.files;
        let file_arr = [];
        let file_obj = {};

        for (let i=0;i<files.length;i++) {
            file_obj.filename = files[i].filename.replace('.pdf', '');
            file_obj.file_size = files[i].size;
            file_arr.push(file_obj);
            file_obj = {};
        }
        console.log(file_arr);
        let record_count = file_arr.length;
        DB.batchInsert(DATA, file_arr, record_count)
            .then(function (data) {
                console.log(data);
                let message = 'PDFs saved.';

                if (data.length === 0) {
                    LOGGER.module().fatal('FATAL: [/uploads/index module (batchInsert)] unable to save PDF data');
                    throw 'FATAL: [/uploads/index module (batchInsert)] unable to save PDF data';
                }

                CACHE.clear_cache();

                res.status(201).send({
                    message: message,
                    files: file_arr
                });

                return null;
            })
            .catch(function (error) {
                LOGGER.module().fatal('FATAL: [/uploads/index module (batchInsert)] unable to save PDF data');
                throw 'FATAL: [/uploads/index module (batchInsert)] unable to save PDF data';
            });
    });
};