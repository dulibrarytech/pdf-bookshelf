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

const PDF = require('./model');
const CONFIG = require('../config/config');
const CACHE = require('../libs/cache');
const FS = require('fs');
const VALIDATOR = require('validator');

exports.get_pdf_viewer = function (req, res) {

    if (req.query.pdf === undefined) {
        res.status(400).send({
            message: 'Bad Request.'
        });

        return false;
    }

    /*
    if (!VALIDATOR.isAlphanumeric(req.body.pdf)) {

        res.status(400).send({
            message: 'Bad Request.'
        });

        return false;
    }
    */
    let pdf = req.query.pdf;

    res.render('viewer', {
        host: CONFIG.host,
        pdf: pdf,
        appname: CONFIG.appName,
        appversion: CONFIG.appVersion,
        organization: CONFIG.organization
    });
};

// http://localhost/bookshelf/pdf/virtual_literacy_in_the_virtual_realm
exports.get_pdf = function (req, res) {

    let filename = req.params.filename;

    if (filename === undefined || filename.length === 0) {
        callback({
            status: 404,
            message: 'Resource not found.'
        });

        return false;
    }

    PDF.update_hit_count(filename, function (data) {

        let pdf = './storage/' + filename + '.pdf';
        let fileStream = FS.createReadStream(pdf);
        let stat = FS.statSync(pdf);

        res.setHeader('Content-Length', stat.size);
        res.setHeader('Content-Type', 'application/pdf');
        fileStream.pipe(res);
    });
};

exports.get_pdf_records = function (req, res) {

    let cache = CACHE.get_cache(req);

    if (cache) {
        res.send(cache);
    } else {
        PDF.get_pdf_records(function (data) {
            res.status(data.status).send(data.data);
        });
    }
};