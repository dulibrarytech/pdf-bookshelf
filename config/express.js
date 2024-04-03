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

const HTTP = require('http'),
    EXPRESS = require('express'),
    COMPRESS = require('compression'),
    BODYPARSER = require('body-parser'),
    METHODOVERRIDE = require('method-override'),
    HELMET = require('helmet'),
    XSS = require('../libs/dom'),
    CACHE = require('../libs/cache'),
    DIRS = require('../libs/directories');
    // CORS = require('cors'),
    // CONFIG = require('../config/config');

module.exports = function() {

    const APP = EXPRESS(),
        SERVER = HTTP.createServer(APP);

    let view_cache = true;

    if (process.env.NODE_ENV === 'development') {
        process.env.NODE_TLS_REJECT_UNAUTHORIZED = 0;
        view_cache = false;
    } else if (process.env.NODE_ENV === 'production') {
        APP.use(COMPRESS());
    }

    APP.use(BODYPARSER.urlencoded({
        extended: true,
        limit: '10000mb',
    }));
    APP.use(BODYPARSER.json());
    APP.use(METHODOVERRIDE());
    APP.use(HELMET());

    APP.use('/bookshelf/static', EXPRESS.static('./public'));
    APP.use(XSS.sanitize_req_query);
    APP.use(XSS.sanitize_req_body);
    APP.set('views', './views');
    APP.set('view engine', 'ejs');
    // APP.set('view cache', view_cache);

    /*
    const CORS_OPTIONS = function (req, callback) {

        const ALLOW = ['https://' + CONFIG.host, 'http://localhost'];
        let cors_options;

        if (ALLOW.indexOf(req.header('Origin')) !== -1) {
            cors_options = {origin: true};
        } else {
            cors_options = {origin: false};
        }

        callback(null, cors_options);
    };

    APP.use(CORS(CORS_OPTIONS));
    */

    require('../auth/routes.js')(APP);
    require('../users/routes.js')(APP);
    require('../pdf/routes.js')(APP);
    require('../dashboard/routes.js')(APP);
    require('../stats/routes.js')(APP);
    require('../uploads/index.js')(APP);
    require('../utils/routes.js')(APP);

    CACHE.clear_cache();
    DIRS.check_directories();

    APP.get('*', function(req, res){
        res.status(404).send('Resource Not Found');
    });

    SERVER.listen(process.env.APP_PORT);

    return APP;
};