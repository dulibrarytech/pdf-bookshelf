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

const APP = require('../repo'),
    REQUEST = require('supertest'),
    CONFIG = require('../config/config'),
    DB = require('../config/db')(),
    DBM = require('../libs/db-migrations'),
    CHAI = require('chai'),
    EXPECT = CHAI.expect,
    API_KEY = CONFIG.apiKey;

const USERNAME = process.env.USERNAME,
    EMAIL = process.env.EMAIL,
    FIRST_NAME = 'Tester',
    LAST_NAME = 'Testerson',
    PASSWORD = process.env.PASSWORD;

const USER = {
    du_id: USERNAME,
    email: EMAIL,
    first_name: FIRST_NAME,
    last_name: LAST_NAME,
    is_active: 1
};

DBM.up();

setTimeout(function () {

    describe('PDF Bookshelf API Integration Tests', function () {

        before(function () {
            // DBM.up();
        });

        after(function () {
            DBM.down();
        });

        // 1.) Create test user
        describe('test name', function () {

            it('Test endpoint: ' + endpoints.users, function (done) {

                REQUEST(APP)
                    .post(endpoints.users + '?api_key=' + API_KEY)
                    .send(USER)
                    .set('Content-Type', 'application/json')
                    .end(function (error, res) {
                        EXPECT(res.statusCode).to.equal(201);
                        done();
                    });
            });
        });
    });

    run();

}, 5000);