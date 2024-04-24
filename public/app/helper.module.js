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

const helperModule = (function () {

    'use strict';

    let obj = {};

    /**
     * Renders error message
     * @param message
     */
    obj.renderError = function (message) {
        domModule.html('#message', '<div class="alert alert-danger"><i class="fa fa-exclamation-circle"></i> ' + DOMPurify.sanitize(message) + '</div>');
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return false;
    };

    /**
     * Gets url parameter
     * @param name
     * @param url
     * @returns {*}
    */
    obj.getParameterByName = function (name, url) {

        if (!url) {
            url = window.location.href;
        }

        name = name.replace(/[\[\]]/g, "\\$&");

        let regex = new RegExp("[?&]" + name + "(=([^&#]*)|&|#|$)"),
            results = regex.exec(url);

        if (!results) {
            return null;
        }

        if (!results[2]) {
            return '';
        }

        return decodeURIComponent(DOMPurify.sanitize(results[2].replace(/\+/g, " ")));
    };

    /**
     * Gets current year
     */
    obj.getCurrentYear = function () {
        let cdate = new Date().getFullYear();
        domModule.html('#cdate', DOMPurify.sanitize(cdate));
    };

    /**
     * Makes content visible only after it is fully rendered on page
     * @param selector
     * @param timeout
     */
    obj.onLoadVisibility = function (selector, timeout) {

        document.addEventListener("DOMContentLoaded", function() {

            setTimeout(function() {

                if (document.querySelector(selector) !== null) {
                    document.querySelector(selector).style.visibility = 'visible';
                }

            }, timeout);
        });
    };

    /**
     * Formats file sizes
     * https://www.codexworld.com/how-to/convert-file-size-bytes-kb-mb-gb-javascript/
     * @param bytes
     * @param decimals
     * @returns {string}
     */
    obj.formatPackageSize = function(bytes, decimals = 1) {

        if (bytes === 0) {
            return '0 Bytes';
        }

        const k = 1024;
        const dm = decimals < 0 ? 0 : decimals;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));

        return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
    }

    /**
     * Copies pdf url to clipboard
     * @param id
     * @returns {Promise<void>}
     */
    obj.copyToClipboard = async function(id) {

        let copied_url = document.getElementById(id + '-text').href;
        let message = '<div class="alert alert-info">"' + copied_url + '" copied to clipboard.</div>';

        try {
            await navigator.clipboard.writeText(copied_url);
            domModule.html('#message', message);
        } catch(error) {
            message = '<div class="alert alert-danger">' + copied_url + ' not copied to clipboard. ' + error + '</div>';
            domModule.html('#message', message);
        }

        setTimeout(function() {
            domModule.html('#message', null);
        }, 4000);
    }

    /**
     * Renders dropzone upload area
     */
    obj.upload = function() {

        Dropzone.options.dropzone = {
            paramName: 'files',
            maxFilesize: 1000*10, // 1GB
            url: '/uploads',
            uploadMultiple: true,
            maxFiles: 100,
            parallelUploads: 100,
            acceptedFiles: '.pdf',
            timeout: 60000*5,
            dictDefaultMessage: 'Drag and Drop PDF files here (**max 100 files)',
            autoProcessQueue: false,
            previewTemplate: document.querySelector('#preview-template').innerHTML,
            init: function () {
                let button = document.querySelector('#upload-button');
                Dropzone = this;
                button.addEventListener('click', function () {
                    Dropzone.processQueue();
                });
            },
            uploadprogress: function () {

                let button = document.querySelector('#upload-button');
                button.innerText = 'Uploading...'

                Dropzone.on('totaluploadprogress', function(progress) {

                    setTimeout(function() {
                        domModule.html('#upload-progress', progress.toFixed(0) + '%');
                        document.querySelector('.progress .progress-bar').style.width = progress + '%';
                        document.querySelector('.progress .progress-bar').innerHTML = progress.toFixed(0) + '%';
                    }, 15);

                });

                Dropzone.on('queuecomplete', function(progress) {

                    setTimeout(function() {
                        document.querySelector('.progress .progress-bar').style.opacity = '0';
                        let button = document.querySelector('#upload-button');
                        button.innerHTML = 'Upload Complete';
                        window.location.replace('/dashboard/home');
                    }, 10);

                });
            },
            success: function(file, response) {
                this.removeAllFiles();
            },
            error: function (file, error) {
                let message = '<div class="alert alert-danger">' + error + ' - "' + file.name + '" is type: ' + file.type + '</div>';
                domModule.html('#message', message);
                this.removeFile(file);
            }
        };
    };

    obj.init = function () {};

    return obj;

}());

helperModule.init();