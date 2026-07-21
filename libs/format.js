/**

 Copyright 2026 University of Denver

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

/*
 * Server-side display formatting (v1 shipped moment.js + DataTables to the
 * client for this; Intl covers it in-process).
 */

const DATE_FORMAT = new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'America/Denver'
});

/**
 * Formats bytes as a human-readable size
 * @param bytes
 */
exports.file_size = function (bytes) {

    const size = Number(bytes);

    if (!Number.isFinite(size) || size <= 0) {
        return '0 B';
    }

    const units = ['B', 'KB', 'MB', 'GB'];
    const exponent = Math.min(Math.floor(Math.log(size) / Math.log(1024)), units.length - 1);
    const value = size / Math.pow(1024, exponent);

    return `${exponent === 0 ? value : value.toFixed(1)} ${units[exponent]}`;
};

/**
 * Formats a date for table display
 * @param value
 */
exports.date = function (value) {

    if (value === null || value === undefined) {
        return '';
    }

    const date = value instanceof Date ? value : new Date(value);

    if (Number.isNaN(date.getTime())) {
        return '';
    }

    return DATE_FORMAT.format(date);
};
