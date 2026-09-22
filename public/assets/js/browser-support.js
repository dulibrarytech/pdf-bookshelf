/**
 * Copyright 2026 University of Denver
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

'use strict';

/*
 * The newest built-ins pdf.js 6.3.289 calls, filled in for browsers that
 * lack them: Map/WeakMap getOrInsert and getOrInsertComputed (2026),
 * Promise.try, RegExp.escape, Math.sumPrecise and the Uint8Array base64 and
 * hex methods (2025).
 * Without the first of these the viewer's event bus fails during start-up,
 * leaving a toolbar that never opens the document - Firefox up to 143,
 * including the 140 ESR, and Safari before 18.4.
 *
 * Loaded by views/viewer.ejs ahead of the pdf.js bundle, and imported by
 * pdf-worker.mjs into the worker, which has a global of its own. A missing
 * built-in is added; a native one is left alone.
 */

(function (global) {

    function get_or_insert_computed(key, compute) {

        if (!this.has(key)) {
            this.set(key, compute(key));
        }

        return this.get(key);
    }

    function get_or_insert(key, value) {

        if (!this.has(key)) {
            this.set(key, value);
        }

        return this.get(key);
    }

    [global.Map, global.WeakMap].forEach(function (type) {

        if (typeof type.prototype.getOrInsertComputed !== 'function') {
            type.prototype.getOrInsertComputed = get_or_insert_computed;
        }

        if (typeof type.prototype.getOrInsert !== 'function') {
            type.prototype.getOrInsert = get_or_insert;
        }
    });

    if (typeof global.Promise.try !== 'function') {
        global.Promise.try = function (fn, ...args) {
            return new Promise(function (resolve) {
                resolve(fn.apply(undefined, args));
            });
        };
    }

    if (typeof global.RegExp.escape !== 'function') {

        /*
         * syntax characters get a backslash, everything else that is not a
         * letter or digit a hex escape, and so does a leading letter or
         * digit - a superset of what the built-in escapes
         */
        const hex = function (c) {
            const code = c.charCodeAt(0);
            return code > 255 ? '\\u' + code.toString(16).padStart(4, '0') : '\\x' + code.toString(16).padStart(2, '0');
        };

        global.RegExp.escape = function (text) {
            return String(text).replace(/[\s\S]/g, function (c, index) {

                if (/[0-9A-Za-z]/.test(c)) {
                    return index === 0 ? hex(c) : c;
                }

                return /[\\^$.*+?()[\]{}|/]/.test(c) ? '\\' + c : hex(c);
            });
        };
    }

    if (typeof global.Uint8Array.fromBase64 !== 'function') {
        global.Uint8Array.fromBase64 = function (text) {

            const binary = global.atob(String(text).replace(/\s+/g, ''));
            const bytes = new Uint8Array(binary.length);

            for (let i = 0; i < binary.length; i += 1) {
                bytes[i] = binary.charCodeAt(i);
            }

            return bytes;
        };
    }

    if (typeof global.Uint8Array.prototype.toBase64 !== 'function') {
        global.Uint8Array.prototype.toBase64 = function () {

            let binary = '';

            for (let i = 0; i < this.length; i += 0x8000) {
                binary += String.fromCharCode.apply(null, this.subarray(i, i + 0x8000));
            }

            return global.btoa(binary);
        };
    }

    if (typeof global.Math.sumPrecise !== 'function') {

        /* Neumaier summation: exact for the integer sizes pdf.js sums, and close for anything else */
        global.Math.sumPrecise = function (values) {

            let sum = 0;
            let compensation = 0;

            for (const value of values) {
                const next = sum + value;
                compensation += Math.abs(sum) >= Math.abs(value) ? (sum - next) + value : (value - next) + sum;
                sum = next;
            }

            return sum + compensation;
        };
    }

    if (typeof global.Uint8Array.prototype.toHex !== 'function') {
        global.Uint8Array.prototype.toHex = function () {

            let hex = '';

            for (let i = 0; i < this.length; i += 1) {
                hex += this[i].toString(16).padStart(2, '0');
            }

            return hex;
        };
    }

    if (typeof global.Uint8Array.fromHex !== 'function') {
        global.Uint8Array.fromHex = function (text) {

            const clean = String(text);
            const bytes = new Uint8Array(clean.length / 2);

            for (let i = 0; i < bytes.length; i += 1) {
                bytes[i] = parseInt(clean.substr(i * 2, 2), 16);
            }

            return bytes;
        };
    }

}(globalThis));
