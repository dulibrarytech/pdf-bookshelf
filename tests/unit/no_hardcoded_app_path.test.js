'use strict';

/*
 * APP_PATH is configurable, and the app has twice shipped code that quietly
 * assumed it was "/bookshelf" - the hand-patched pdf.js viewer, and the error
 * page. Both failed as 404s with nothing pointing at the cause.
 *
 * This scans the code that builds URLs for that literal. Anything it finds
 * should be reading `app_path` from the view locals, or from the
 * data-attribute the server renders, instead.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const FS = require('node:fs');
const PATH = require('node:path');

const ROOT = PATH.join(__dirname, '../..');

/*
 * Where a hardcoded path would actually hurt. Deliberately excluded:
 *   config/config.js  - declares the default, which is the one honest place
 *   public/libs       - vendored upstream code, installed unmodified
 *   tests             - assert against the default config on purpose
 *   .env-example      - full URLs a deployer edits
 */
const SCANNED = [
    'views',
    'public/assets',
    'auth', 'pdfs', 'dashboard', 'users', 'uploads', 'utils', 'libs', 'config'
];

const ALLOWED = new Set([PATH.join(ROOT, 'config/config.js')]);

function files(dir) {

    const absolute = PATH.join(ROOT, dir);

    if (!FS.existsSync(absolute)) {
        return [];
    }

    return FS.readdirSync(absolute, {withFileTypes: true, recursive: true})
        .filter((entry) => entry.isFile() && /\.(js|ejs|css)$/.test(entry.name))
        .map((entry) => PATH.join(entry.parentPath || entry.path, entry.name));
}

test('no source file hardcodes the default APP_PATH', () => {

    const offenders = [];

    for (const dir of SCANNED) {
        for (const file of files(dir)) {

            if (ALLOWED.has(file)) {
                continue;
            }

            FS.readFileSync(file, 'utf8').split('\n').forEach(function (line, index) {

                if (line.includes('/bookshelf')) {
                    offenders.push(`${PATH.relative(ROOT, file)}:${index + 1}: ${line.trim()}`);
                }
            });
        }
    }

    assert.deepEqual(offenders, [], 'use app_path from the view locals instead of a literal');
});
