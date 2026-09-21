'use strict';

/*
 * Controllers answer with views, never with markup built from strings. The
 * users controller used to interpolate error.message into a template literal -
 * `<td>${error.message}</td>` - which is safe only while every message is a
 * static string; the first `new ValidationError(body.x)` someone adds makes it
 * injected markup. Every fragment now goes through EJS, which escapes, and
 * this file keeps it that way: a scan over the app code, plus the two shared
 * fragments rendered with hostile text.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const FS = require('node:fs');
const PATH = require('node:path');
const EJS = require('ejs');

const ROOT = PATH.join(__dirname, '../..');
const SCANNED = ['auth', 'pdfs', 'dashboard', 'users', 'uploads', 'utils', 'libs', 'config'];

/* a template literal that opens a tag and interpolates into it */
const INTERPOLATED_MARKUP = /`<[^`]*\$\{/;
/* res.send() handed a string that starts a tag */
const SENT_MARKUP = /\.send\(\s*['"`]</;

function files(dir) {

    const absolute = PATH.join(ROOT, dir);

    return FS.readdirSync(absolute, {withFileTypes: true, recursive: true})
        .filter((entry) => entry.isFile() && entry.name.endsWith('.js'))
        .map((entry) => PATH.join(entry.parentPath || entry.path, entry.name));
}

test('the scan reaches the app code', () => {
    const count = SCANNED.reduce((total, dir) => total + files(dir).length, 0);
    assert.ok(count >= 20, `only found ${count} files`);
});

test('no controller or library builds markup from strings', () => {

    const offenders = [];

    for (const dir of SCANNED) {
        for (const file of files(dir)) {
            FS.readFileSync(file, 'utf8').split('\n').forEach(function (line, index) {

                if (INTERPOLATED_MARKUP.test(line) || SENT_MARKUP.test(line)) {
                    offenders.push(`${PATH.relative(ROOT, file)}:${index + 1}: ${line.trim()}`);
                }
            });
        }
    }

    assert.deepEqual(offenders, [], 'answer with a view (views/fragments/message-row.ejs or alert.ejs) instead');
});

const HOSTILE = '<img src=x onerror=alert(1)> & "quotes"';
const ESCAPED = '&lt;img src=x onerror=alert(1)&gt; &amp; &#34;quotes&#34;';

test('the message-row fragment escapes its text and spans what it is told', async () => {

    const html = await EJS.renderFile(PATH.join(ROOT, 'views/fragments/message-row.ejs'), {colspan: 6, css: 'text-danger', message: HOSTILE});

    assert.doesNotMatch(html, /<img/);
    assert.ok(html.includes(ESCAPED), html);
    assert.match(html, /<td colspan="6" class="text-danger">/);

    /* the css local is optional - the bookshelf rows pass none */
    const plain = await EJS.renderFile(PATH.join(ROOT, 'views/fragments/message-row.ejs'), {colspan: 5, message: 'Record not found.'});
    assert.match(plain, /<tr><td colspan="5">Record not found\.<\/td><\/tr>/);
});

test('the alert fragment escapes its text', async () => {

    const html = await EJS.renderFile(PATH.join(ROOT, 'views/fragments/alert.ejs'), {message: HOSTILE});

    assert.doesNotMatch(html, /<img/);
    assert.ok(html.includes(ESCAPED), html);
    assert.match(html, /class="alert alert-danger mb-0"/);
});
