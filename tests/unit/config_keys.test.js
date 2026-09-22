'use strict';

/*
 * config/config.js is the one place the app reads its environment, so three
 * things can be checked mechanically:
 *   - every key it exposes is read somewhere (HOST sat unread for two months)
 *   - every CONFIG.<key> the code reads exists there - a misspelled key is
 *     silently undefined, which for a limit or a path means "use the fallback"
 *     with nothing said
 *   - every variable it reads is documented in .env-example, and everything
 *     .env-example documents is read by something
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const FS = require('node:fs');
const PATH = require('node:path');

const ROOT = PATH.join(__dirname, '../..');
const APP_DIRS = ['auth', 'pdfs', 'dashboard', 'users', 'uploads', 'utils', 'libs', 'config', 'scripts', 'knex'];
const ROOT_FILES = ['pdf-bookshelf.js', 'knexfile.js'];

function app_files() {

    const files = ROOT_FILES.map((name) => PATH.join(ROOT, name));

    for (const dir of APP_DIRS) {
        for (const entry of FS.readdirSync(PATH.join(ROOT, dir), {withFileTypes: true, recursive: true})) {
            if (entry.isFile() && entry.name.endsWith('.js')) {
                files.push(PATH.join(entry.parentPath || entry.path, entry.name));
            }
        }
    }

    return files;
}

const CONFIG_SOURCE = FS.readFileSync(PATH.join(ROOT, 'config/config.js'), 'utf8');
const EXAMPLE_ENV = FS.readFileSync(PATH.join(ROOT, '.env-example'), 'utf8');

/* the keys of the frozen object config.js exports */
const CONFIG_KEYS = [...CONFIG_SOURCE.matchAll(/^ {4}(\w+):/gm)].map((m) => m[1]);
/* the variables config.js reads */
const CONFIG_READS = new Set([...CONFIG_SOURCE.matchAll(/process\.env\.([A-Z_]+)/g)].map((m) => m[1]));
/* the variables .env-example documents */
const DOCUMENTED = [...EXAMPLE_ENV.matchAll(/^([A-Z_]+)=/gm)].map((m) => m[1]);

test('the scans reach the code', () => {
    assert.ok(CONFIG_KEYS.length >= 20, `config keys found: ${CONFIG_KEYS.length}`);
    assert.ok(DOCUMENTED.length >= 20, `documented variables found: ${DOCUMENTED.length}`);
    assert.ok(app_files().length >= 30, `app files found: ${app_files().length}`);
});

test('every config key is read somewhere, and every CONFIG.<key> read exists', () => {

    const read = new Set();

    for (const file of app_files()) {

        const source = FS.readFileSync(file, 'utf8');

        for (const match of source.matchAll(/\bCONFIG\.(\w+)/g)) {
            read.add(match[1]);
        }

        /* config/validate.js takes the object as a parameter named config */
        if (file.endsWith('config/validate.js')) {
            for (const match of source.matchAll(/\bconfig\.(\w+)/g)) {
                read.add(match[1]);
            }
        }
    }

    const unread = CONFIG_KEYS.filter((key) => !read.has(key));
    assert.deepEqual(unread, [], 'config keys nothing reads - remove them, or use them');

    const unknown = [...read].filter((key) => !CONFIG_KEYS.includes(key));
    assert.deepEqual(unknown, [], 'CONFIG.<key> reads with no such key - a typo, silently undefined');
});

test('what config.js reads is documented in .env-example, and what .env-example documents is read', () => {

    const undocumented = [...CONFIG_READS].filter((name) => !DOCUMENTED.includes(name));
    assert.deepEqual(undocumented, [], 'variables config.js reads that .env-example does not show');

    const read_anywhere = new Set();

    for (const file of app_files()) {
        for (const match of FS.readFileSync(file, 'utf8').matchAll(/process\.env\.([A-Z_]+)/g)) {
            read_anywhere.add(match[1]);
        }
    }

    const dead = DOCUMENTED.filter((name) => !read_anywhere.has(name));
    assert.deepEqual(dead, [], '.env-example variables nothing reads');
});
