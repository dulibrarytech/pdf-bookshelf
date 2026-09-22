'use strict';

/*
 * The dashboard shell loads Bootstrap and htmx from public/libs, where
 * scripts/vendor-assets.js copies them from node_modules. Three things keep a
 * deploy from ending up unstyled and inert, and each is pinned here:
 *   - the packages are runtime dependencies, so `npm ci --omit=dev` has them
 *   - npm's postinstall hook runs the copy, so there is no step to forget
 *   - every vendored path a template loads is one the script produces
 * (config/validate.js adds the last line of defence: the app refuses to start
 * while any of those files is missing.)
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const FS = require('node:fs');
const PATH = require('node:path');

const ROOT = PATH.join(__dirname, '../..');
const PACKAGE = require('../../package.json');
const { ASSETS } = require('../../scripts/vendor-assets');

test('the vendored packages are runtime dependencies, not dev ones', () => {

    /* the regression: a deploy installs with --omit=dev, and the copy then had nothing to copy */
    for (const name of ['bootstrap', 'htmx.org']) {
        assert.ok(PACKAGE.dependencies[name], `${name} must be in dependencies`);
        assert.equal(PACKAGE.devDependencies[name], undefined, `${name} must not be in devDependencies`);
    }
});

test('npm install vendors the assets without a separate step', () => {
    assert.match(PACKAGE.scripts.postinstall, /scripts\/vendor-assets\.js/);
});

test('every vendored file a template loads is one the vendor script produces', () => {

    const produced = new Set(ASSETS.map(([, destination]) => destination));
    const loaded = new Set();

    for (const file of FS.readdirSync(PATH.join(ROOT, 'views'), {withFileTypes: true, recursive: true})) {

        if (!file.isFile() || !file.name.endsWith('.ejs')) {
            continue;
        }

        const source = FS.readFileSync(PATH.join(file.parentPath || file.path, file.name), 'utf8');

        for (const match of source.matchAll(/\/static\/(libs\/[^"?]+)/g)) {

            /* pdf.js is committed to git, not vendored by this script (the viewer also names its directory) */
            if (!/^libs\/pdfjs(\/|$)/.test(match[1])) {
                loaded.add('public/' + match[1]);
            }
        }
    }

    assert.ok(loaded.size >= 3, `expected the templates to load vendored assets, found ${loaded.size}`);

    for (const path of loaded) {
        assert.ok(produced.has(path), `${path} is loaded by a template but not produced by scripts/vendor-assets.js`);
    }
});
