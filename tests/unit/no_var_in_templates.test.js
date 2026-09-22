'use strict';

/*
 * `var` is banned application-wide (see CLAUDE.md). ESLint's no-var rule
 * enforces that for .js, but it cannot parse .ejs - and these templates carry
 * scriptlet JS, which is exactly where the one violation in this repo lived
 * (views/partials/header.ejs, two declarations). This closes that gap.
 *
 * Ported from repo-backend-v2's tests/unit/views/no_var_in_templates.test.js
 * to node:test.
 *
 * Only JS regions are scanned. That deliberately skips CSS custom properties
 * like `style="color: var(--text-muted)"`, which are not JS and appear all
 * over these templates.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const FS = require('node:fs');
const PATH = require('node:path');

const VIEWS = PATH.join(__dirname, '..', '..', 'views');

/* <% ... %>, <%= ... %>, <%- ... %> - but not <%/* comment *\/%> */
const JS_REGION = /<%(?!\/\*)[=\-_]?([\s\S]*?)[-_]?%>/g;
/* `var` followed by whitespace and an identifier: a declaration, not var(--x) */
const VAR_DECL = /\bvar\s+[A-Za-z_$]/;

function templates(dir, out = []) {

    for (const entry of FS.readdirSync(dir, {withFileTypes: true})) {

        const full = PATH.join(dir, entry.name);

        if (entry.isDirectory()) {
            templates(full, out);
        } else if (entry.name.endsWith('.ejs')) {
            out.push(full);
        }
    }

    return out;
}

function offenders() {

    const found = [];

    for (const file of templates(VIEWS)) {

        const source = FS.readFileSync(file, 'utf8');

        for (const region of source.matchAll(JS_REGION)) {

            if (!VAR_DECL.test(region[1])) {
                continue;
            }

            const line = source.slice(0, region.index).split('\n').length;
            found.push(`${PATH.relative(VIEWS, file)}:${line}`);
        }
    }

    return found;
}

test('the scan actually reaches the templates', () => {
    /* a guard that silently scans nothing is worse than no guard */
    assert.ok(templates(VIEWS).length > 10, `only found ${templates(VIEWS).length} templates`);
});

test('no template declares a variable with var - use let or const', () => {
    assert.deepEqual(offenders(), []);
});

test('the scanner does not mistake a CSS var() call for a declaration', () => {
    assert.equal(VAR_DECL.test('style="color: var(--text-muted, #6c757d)"'), false);
    assert.equal(VAR_DECL.test('border-top: 1px solid var(--border)'), false);
    assert.equal(VAR_DECL.test('let x = 1'), false);
    assert.equal(VAR_DECL.test('var x = 1'), true);
    assert.equal(VAR_DECL.test('for (var i = 0;'), true);
});
