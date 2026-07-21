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
 * Copies vendored client assets from node_modules into public/libs so the app
 * serves everything itself (CSP self-only, no CDNs). Run after npm install:
 *   npm run vendor
 */

const FS = require('fs');
const PATH = require('path');

const ROOT = PATH.join(__dirname, '..');

const ASSETS = [
    ['node_modules/bootstrap/dist/css/bootstrap.min.css', 'public/libs/bootstrap/bootstrap.min.css'],
    ['node_modules/bootstrap/dist/css/bootstrap.min.css.map', 'public/libs/bootstrap/bootstrap.min.css.map'],
    ['node_modules/bootstrap/dist/js/bootstrap.bundle.min.js', 'public/libs/bootstrap/bootstrap.bundle.min.js'],
    ['node_modules/bootstrap/dist/js/bootstrap.bundle.min.js.map', 'public/libs/bootstrap/bootstrap.bundle.min.js.map'],
    ['node_modules/htmx.org/dist/htmx.min.js', 'public/libs/htmx/htmx.min.js']
];

for (const [src, dest] of ASSETS) {

    const src_path = PATH.join(ROOT, src);
    const dest_path = PATH.join(ROOT, dest);

    if (!FS.existsSync(src_path)) {
        console.error(`MISSING: ${src} - run npm install first.`);
        process.exitCode = 1;
        continue;
    }

    FS.mkdirSync(PATH.dirname(dest_path), {recursive: true});
    FS.copyFileSync(src_path, dest_path);
    console.log(`vendored ${dest}`);
}
