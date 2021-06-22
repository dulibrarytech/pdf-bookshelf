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

const statsModule = (function () {

    'use strict';

    const api = configModule.getApi();
    const endpoints = apiModule.endpoints();
    let obj = {};

    /**
     * Renders bookshelf stats on home page
     * @param data
     */
    const renderStats = function (data) {
        domModule.html('#total-pdfs', DOMPurify.sanitize(data.total_pdfs));
        domModule.html('#most-accessed-file', DOMPurify.sanitize(data.most_accessed_file));
        domModule.html('#total-file-requests', DOMPurify.sanitize(data.total_hits));
    };

    /**
     * Gets stats from bookshelf
     */
    obj.getStats = function () {

        let token = userModule.getUserToken();
        let url = api + endpoints.stats,
            request = new Request(url, {
                method: 'GET',
                mode: 'cors',
                headers: {
                    'Content-Type': 'application/json',
                    'x-access-token': token
                }
            });

        const callback = function (response) {

            if (response.status === 200) {

                response.json().then(function (data) {

                    if (data.total_pdfs === 0) {
                        domModule.hide('.page-inner');
                        domModule.html('#message', '<div class="alert alert-info"><i class="fa fa-exclamation-circle"></i> No PDFs found.&nbsp;&nbsp;&nbsp;<a href="/dashboard/upload">Upload PDFs</a></div>');
                    } else {
                        renderStats(data);
                    }
                });

            } else if (response.status === 401) {

                helperModule.renderError('Error: (HTTP status ' + response.status + '). Your session has expired.  You will be redirected to the login page momentarily.');

                setTimeout(function () {
                    window.location.replace('/login');
                }, 4000);

            } else {
                helperModule.renderError('Error: (HTTP status ' + response.status + '). Unable to retrieve repository statistics.');
            }
        };

        httpModule.req(request, callback);
    };

    obj.init = function () {
        obj.getStats();
    };

    return obj;

}());

statsModule.init();