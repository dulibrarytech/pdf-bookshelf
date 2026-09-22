'use strict';

/*
 * libs/pdfjs.version() keys the viewer's URLs to the vendored bundle, so an
 * upgrade is not served from a browser's day-old cache. It reads the version
 * marker every pdf.js release carries, and falls back to a content hash.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const FS = require('node:fs');
const PATH = require('node:path');
const OS = require('node:os');
const PDFJS = require('../../libs/pdfjs');

function bundle_with(pdf_mjs) {

    const dir = FS.mkdtempSync(PATH.join(OS.tmpdir(), 'bookshelf-pdfjs-'));
    FS.mkdirSync(PATH.join(dir, 'build'));
    FS.writeFileSync(PATH.join(dir, 'build/pdf.mjs'), pdf_mjs);
    return dir;
}

test('reads the version marker the release bundle carries', () => {
    assert.equal(PDFJS.version(bundle_with('/**\n * @licstart\n */\n// pdfjsVersion = 9.9.9\n// pdfjsBuild = abc\nexport {};')), '9.9.9');
});

test('falls back to a content hash when there is no marker - still a key that changes with the bytes', () => {

    const first = PDFJS.version(bundle_with('export const a = 1;'));
    const same = PDFJS.version(bundle_with('export const a = 1;'));
    const other = PDFJS.version(bundle_with('export const a = 2;'));

    assert.match(first, /^[0-9a-f]{12}$/);
    assert.equal(first, same);
    assert.notEqual(first, other);
});

test('a bundle that is not there yields a constant rather than a crash', () => {
    assert.equal(PDFJS.version(PATH.join(OS.tmpdir(), 'no-such-bundle')), 'missing');
});

test('the vendored bundle yields its release version, not the hash fallback', () => {

    /*
     * if this ever fails after an upgrade, the marker's format changed: the
     * hash fallback still busts correctly, so fix the regex for readable URLs
     */
    assert.match(PDFJS.version(), /^\d+\.\d+\.\d+$/);
});
