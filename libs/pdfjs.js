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
 * (?v=) so a browser cannot serve a day-old bundle after an upgrade.
 *
 * The static middleware caches for a day in production, and pdf.js hard-fails
 * when its API and worker versions disagree. Keyed to the version, an upgrade
 * - a security one, especially - reaches a returning browser on its next
 * visit rather than after the old files age out of its cache. Read from the
 * build itself: every file in the release bundle carries `pdfjsVersion =
 * X.Y.Z` in its header, so nothing has to be bumped by hand. Falls back to a
 * content hash of pdf.mjs should a future build drop the marker - that still
 * busts correctly, just less readably.
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
