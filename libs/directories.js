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

const FS = require('fs'),
    LOGGER = require('../libs/log4'),
    STORAGE = './storage';

/**
 * Checks if required directories exist, creates them if they don't
 */
exports.check_directories = function () {

    try {

        if (!FS.existsSync(STORAGE)) {

            LOGGER.module().info('INFO: [/libs/directories (check_directories)] storage directory not found. Creating directory...');

            FS.mkdir(STORAGE, function(error) {

                if (error) {
                    throw error;
                }

                LOGGER.module().info('INFO: [/libs/directories (check_directories)] storage directory created.');
            });
        }

    } catch (error) {
        throw error;
    }
};