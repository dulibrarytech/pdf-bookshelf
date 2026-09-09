'use strict';

/*
 * Re-sync reconciles storage/ with tbl_pdfs. Its decisions are what matter and
 * are easy to get subtly wrong, so they live in a pure plan() the database
 * never touches; scan_storage() is exercised against a real temp directory.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const FS = require('node:fs');
const PATH = require('node:path');
const OS = require('node:os');
const MODEL = require('../../utils/model');

const scan = MODEL._scan_storage;
const plan = MODEL._plan;

function storage_with(names) {

    const dir = FS.mkdtempSync(PATH.join(OS.tmpdir(), 'bookshelf-resync-'));

    for (const [name, contents] of Object.entries(names)) {
        const full = PATH.join(dir, name);
        FS.mkdirSync(PATH.dirname(full), {recursive: true});
        FS.writeFileSync(full, contents);
    }

    return dir;
}

/* --- scanning --- */

test('scanning finds PDFs and keys them by name without the extension', async () => {

    const dir = storage_with({'report.pdf': 'aaaa', 'Minutes.PDF': 'bb'});
    const files = await scan(dir);

    assert.deepEqual([...files.keys()].sort(), ['Minutes', 'report']);
    assert.equal(files.get('report').size, 4);
    assert.equal(files.get('report').name, 'report.pdf');
});

test('scanning skips the staging directory, dotfiles and non-PDFs', async () => {

    const dir = storage_with({
        'keep.pdf': 'x',
        '.gitkeep': '',
        '.hidden.pdf': 'x',
        'notes.txt': 'x',
        'archive.pdf.zip': 'x',
        '.tmp/staged-upload': 'x'
    });

    const files = await scan(dir);

    /*
     * multer stages into storage/.tmp - a half-written upload is not a PDF
     * on the shelf, and picking it up would create a row for a partial file
     */
    assert.deepEqual([...files.keys()], ['keep']);
});

test('an empty storage directory scans to nothing rather than failing', async () => {
    assert.equal((await scan(storage_with({}))).size, 0);
});

/* --- the decisions --- */

const file = (name, size) => [name.replace(/\.pdf$/i, ''), {name: name, size: size}];

test('a file with no row is added', () => {

    const files = new Map([file('new.pdf', 10)]);
    const result = plan(files, []);

    assert.equal(result.add.length, 1);
    assert.equal(result.add[0].filename, 'new');
    assert.deepEqual(result.remeasure, []);
});

test('a file whose size changed is re-measured', () => {

    const files = new Map([file('doc.pdf', 999)]);
    const rows = [{id: 7, filename: 'doc', file_size: 10, sha256: 'abc', is_active: 1}];

    assert.deepEqual(plan(files, rows).add, []);
    assert.equal(plan(files, rows).remeasure[0].id, 7);
});

test('a row that was never hashed is re-measured even at the same size', () => {

    /* rows carried over from v1 have no sha256 */
    const files = new Map([file('doc.pdf', 10)]);
    const rows = [{id: 7, filename: 'doc', file_size: 10, sha256: null, is_active: 1}];

    assert.equal(plan(files, rows).remeasure.length, 1);
});

test('a matching, already-hashed row is left alone', () => {

    const files = new Map([file('doc.pdf', 10)]);
    const rows = [{id: 7, filename: 'doc', file_size: 10, sha256: 'abc', is_active: 1}];
    const result = plan(files, rows);

    assert.deepEqual(result.add, []);
    assert.deepEqual(result.remeasure, []);
    assert.deepEqual(result.missing, []);
});

test('file_size arriving as a string still compares equal', () => {

    /*
     * mysql can hand back BIGINT as a string; a loose compare here would
     * re-hash the whole corpus on every run
     */
    const files = new Map([file('doc.pdf', 10)]);
    const rows = [{id: 7, filename: 'doc', file_size: '10', sha256: 'abc', is_active: 1}];

    assert.deepEqual(plan(files, rows).remeasure, []);
});

test('an active row whose file is gone is reported missing', () => {

    const rows = [{id: 7, filename: 'vanished', file_size: 10, sha256: 'abc', is_active: 1}];
    assert.deepEqual(plan(new Map(), rows).missing, ['vanished.pdf']);
});

test('a soft-deleted row whose file is gone is NOT reported', () => {

    /*
     * removing a PDF from the bookshelf is meant to leave the file behind or
     * not - either way it is not an inconsistency to flag
     */
    const rows = [{id: 7, filename: 'removed', file_size: 10, sha256: 'abc', is_active: 0}];
    assert.deepEqual(plan(new Map(), rows).missing, []);
});

test('a soft-deleted row is not re-added when its file is still there', () => {

    /* the row exists, so it is not an add - re-sync must not resurrect it */
    const files = new Map([file('removed.pdf', 10)]);
    const rows = [{id: 7, filename: 'removed', file_size: 10, sha256: 'abc', is_active: 0}];
    const result = plan(files, rows);

    assert.deepEqual(result.add, []);
    assert.deepEqual(result.missing, []);
});

test('a realistic mixed run sorts every case into the right bucket', () => {

    const files = new Map([file('fresh.pdf', 5), file('grew.pdf', 900), file('same.pdf', 10)]);
    const rows = [
        {id: 1, filename: 'grew', file_size: 10, sha256: 'a', is_active: 1},
        {id: 2, filename: 'same', file_size: 10, sha256: 'b', is_active: 1},
        {id: 3, filename: 'gone', file_size: 10, sha256: 'c', is_active: 1},
        {id: 4, filename: 'retired', file_size: 10, sha256: 'd', is_active: 0}
    ];

    const result = plan(files, rows);

    assert.deepEqual(result.add.map((a) => a.filename), ['fresh']);
    assert.deepEqual(result.remeasure.map((r) => r.filename), ['grew']);
    assert.deepEqual(result.missing, ['gone.pdf']);
});
