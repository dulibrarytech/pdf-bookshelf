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

const apiModule = (function () {

    'use strict';

    let obj = {};

    /**
     * Contains api endpoints
     */
    obj.endpoints = function () {
        return {
            authenticate: '/api/v1/authenticate',
            users: '/api/v1/users',
            pdf: '/pdf/',
            pdfs: '/api/v1/pdfs/',
            stats: '/api/v1/stats'
        };
    };

    return obj;

}());