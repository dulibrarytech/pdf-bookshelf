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
 * The version of the vendored pdf.js bundle, used to key the viewer's URLs
 * (?v=) so an upgrade reaches a returning browser at once. Read from the
 * bundle's own `pdfjsVersion = X.Y.Z` marker, so nothing is bumped by hand;
 * falls back to a content hash of pdf.mjs should a build drop the marker.
 */

const FS = require('node:fs');
const PATH = require('node:path');
const CRYPTO = require('node:crypto');

const BUNDLE = PATH.join(__dirname, '..', 'public/libs/pdfjs');
const MARKER = /pdfjsVersion = (\d+\.\d+\.\d+)/;

/**
 * @param bundle the vendored bundle's directory (the app's by default)
 * @returns {string} the release version, a 12-hex content hash, or "missing"
 */
exports.version = function (bundle = BUNDLE) {

    let source;

    try {
        source = FS.readFileSync(PATH.join(bundle, 'build/pdf.mjs'));
    } catch {
        /* nothing to key; the viewer cannot work either way */
        return 'missing';
    }

    const match = MARKER.exec(source.subarray(0, 4096).toString('utf8'));

    if (match !== null) {
        return match[1];
    }

    return CRYPTO.createHash('sha1').update(source).digest('hex').slice(0, 12);
};
