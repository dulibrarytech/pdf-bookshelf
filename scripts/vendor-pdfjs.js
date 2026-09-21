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
 * Installs the pdf.js viewer into public/libs/pdfjs.
 *
 *   node scripts/vendor-pdfjs.js 6.3.289          # download the release
 *   node scripts/vendor-pdfjs.js ./pdfjs-dist.zip # or use a local bundle
 *
 * npm's pdfjs-dist package ships the library but NOT the generic viewer
 * application, so the viewer has to come from the GitHub release bundle.
 *
 * The bundle is installed UNMODIFIED. Everything this app needs to override -
 * where the PDF comes from, where the worker and font/cmap/wasm assets live -
 * is set at runtime from public/assets/js/pdf-viewer-config.js via the
 * viewer's own `webviewerloaded` hook, and the page markup lives in
 * views/viewer.ejs. That is deliberate: v1 and v2.0 hand-patched constants
 * inside the bundle, which is why a 2021 build with known CVEs survived five
 * years of upgrades. Nothing here needs re-patching - re-run this script.
 *
 * After upgrading, diff the release's web/viewer.html against views/viewer.ejs;
 * the viewer only wires up element IDs that exist, so new toolbar features
 * stay dark until the markup is carried over.
 */

const FS = require('node:fs');
const PATH = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = PATH.join(__dirname, '..');
const TARGET = PATH.join(ROOT, 'public/libs/pdfjs');

/* what the app actually serves; everything else in the bundle is dropped */
const KEEP = [
    'LICENSE',
    'build/pdf.mjs',
    'build/pdf.worker.mjs',
    'build/pdf.sandbox.mjs',
    'web/viewer.mjs',
    'web/viewer.css',
    'web/cmaps',
    'web/iccs',
    'web/wasm',
    'web/standard_fonts',
    'web/images',
    'web/locale'
];

/*
 * Dropped on purpose:
 *   *.map                        - 12 MB of source maps into a git-committed tree
 *   web/viewer.html              - views/viewer.ejs is our copy; shipping theirs
 *                                  would serve a second, unauthenticated viewer
 *   web/debugger.*               - development tooling
 *   compressed.tracemonkey-*.pdf - the upstream sample document
 */

async function main() {

    const argument = process.argv[2];

    if (!argument) {
        console.error('usage: node scripts/vendor-pdfjs.js <version|path-to-dist.zip>');
        process.exitCode = 1;
        return;
    }

    const work = FS.mkdtempSync(PATH.join(require('node:os').tmpdir(), 'vendor-pdfjs-'));
    let zip = argument;

    if (!argument.endsWith('.zip')) {

        const url = `https://github.com/mozilla/pdf.js/releases/download/v${argument}/pdfjs-${argument}-dist.zip`;
        console.log(`downloading ${url}`);

        const response = await fetch(url);

        if (!response.ok) {
            console.error(`download failed: HTTP ${response.status}`);
            process.exitCode = 1;
            return;
        }

        zip = PATH.join(work, 'dist.zip');
        FS.writeFileSync(zip, Buffer.from(await response.arrayBuffer()));
    }

    const extracted = PATH.join(work, 'dist');
    execFileSync('unzip', ['-oq', PATH.resolve(zip), '-d', extracted]);

    FS.rmSync(TARGET, {recursive: true, force: true});

    for (const entry of KEEP) {

        const source = PATH.join(extracted, entry);

        if (!FS.existsSync(source)) {
            console.error(`MISSING from the bundle: ${entry}`);
            process.exitCode = 1;
            continue;
        }

        const destination = PATH.join(TARGET, entry);
        FS.mkdirSync(PATH.dirname(destination), {recursive: true});
        FS.cpSync(source, destination, {recursive: true, filter: (path) => !path.endsWith('.map')});
    }

    FS.rmSync(work, {recursive: true, force: true});

    /* the same reader the app keys the viewer's URLs with at boot */
    console.log(`vendored pdf.js ${require('../libs/pdfjs').version(TARGET)} into public/libs/pdfjs`);
}

main();
