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

const objectsModule = (function () {

    'use strict';

    const endpoints = apiModule.endpoints();
    let obj = {};

    /**
     * Gets pdf objects
     */
    obj.getObjects = function () {

        let token = userModule.getUserToken(),
            request = new Request(endpoints.pdfs, {
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
                    domModule.html('#message', null);
                    objectsModule.renderDisplayRecords(data);
                });

            } else if (response.status === 401) {

                response.json().then(function (response) {

                    helperModule.renderError('Error: (HTTP status ' + response.status + '). Your session has expired.  You will be redirected to the login page momentarily.');

                    setTimeout(function () {
                        window.location.replace('/login');
                    }, 4000);
                });

            } else {
                helperModule.renderError('Error: (HTTP status ' + response.status + '). Unable to get objects.');
            }
        };

        httpModule.req(request, callback);
    };

    /**
     * Renders records
     * @param data
     * @returns {boolean}
     */
    obj.renderDisplayRecords = function (data) {

        let html = '';

        if (data.length === 0) {
            html = '<div class="alert alert-info"><strong><i class="fa fa-info-circle"></i>&nbsp; No PDFs found.</strong></div>';
            domModule.html('#objects', html);
            return false;
        }

        for (let i = 0; i < data.length; i++) {
            html += '<tr>';
            html += '<td><a href="#" title="copy to clipboard" onclick="helperModule.copyToClipboard(\'copy-' + data[i].id + '\');"><i id="copy-' + data[i].id + '" class="fa fa-copy"></i></a> &nbsp;&nbsp;|&nbsp;&nbsp; <a id="copy-' + data[i].id + '-text" href="' + configModule.getSystemDomain() + data[i].filename + '" title="View PDF" target="_blank">' + data[i].filename + '</a></td>';
            html += '<td>' + helperModule.formatPackageSize(data[i].file_size) + '</td>';
            html += '<td>' + data[i].hits + '</td>';
            html += '<td>' + data[i].created + '</td>';
            html += '</tr>';
        }

        domModule.html('#objects', html);

        setTimeout(function() {
            $('#data-table').DataTable({});
        }, 50);
    };

    obj.init = function () {
        domModule.html('#message', 'Loading...');
        objectsModule.getObjects();
    };

    return obj;

}());