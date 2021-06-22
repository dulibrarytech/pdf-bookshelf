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

const PDF = require('./model'),
    CONFIG = require('../config/config'),
    CACHE = require('../libs/cache'),
    FS = require('fs');

exports.get_pdf_viewer = function (req, res) {

    let pdf = req.query.pdf;

    res.render('viewer', {
        host: CONFIG.host,
        pdf: pdf,
        appname: CONFIG.appName,
        appversion: CONFIG.appVersion,
        organization: CONFIG.organization
    });
};

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

        let pdf = './storage/' + filename;
        let fileStream = FS.createReadStream(pdf);
        let stat = FS.statSync(pdf);

        res.setHeader('Content-Length', stat.size);
        res.setHeader('Content-Type', 'application/pdf');
        fileStream.pipe(res);
    });
};

exports.get_pdfs = function (req, res) {

    let cache = CACHE.get_cache(req);

    if (cache) {
        res.send(cache);
    } else {
        PDF.get_pdfs(function (data) {
            res.status(data.status).send(data.data);
        });
    }
};