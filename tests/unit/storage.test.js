'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const FS = require('node:fs');
const PATH = require('node:path');
const OS = require('node:os');
const STORAGE = require('../../libs/storage');

function workspace() {
    return FS.mkdtempSync(PATH.join(OS.tmpdir(), 'bookshelf-storage-'));
}

test('move_exclusive publishes a staged file and clears the staging copy', async () => {

    const dir = workspace();
    const source = PATH.join(dir, 'staged');
    const destination = PATH.join(dir, 'published.pdf');

    FS.writeFileSync(source, 'uploaded bytes');
    await STORAGE.move_exclusive(source, destination);

    assert.equal(FS.readFileSync(destination, 'utf8'), 'uploaded bytes');
    assert.equal(FS.existsSync(source), false);
});

/*
 * the regression this replaced: fs.rename overwrote a file that the database
 * had no row for, destroying it silently
 */
test('move_exclusive refuses to overwrite an existing file', async () => {

    const dir = workspace();
    const source = PATH.join(dir, 'staged');
    const destination = PATH.join(dir, 'published.pdf');

    FS.writeFileSync(destination, 'a purchased pdf with no database row');
    FS.writeFileSync(source, 'uploaded bytes');

    await assert.rejects(
        () => STORAGE.move_exclusive(source, destination),
        (error) => error.code === 'EEXIST'
    );

    /*
     * the file on the shelf is untouched, and the upload is still staged so
     * the caller can report and clean it up
     */
    assert.equal(FS.readFileSync(destination, 'utf8'), 'a purchased pdf with no database row');
    assert.equal(FS.existsSync(source), true);
});

test('move_exclusive lets only one of two concurrent claims win', async () => {

    const dir = workspace();
    const destination = PATH.join(dir, 'contested.pdf');
    const sources = ['first', 'second'].map(function (name) {
        const path = PATH.join(dir, name);
        FS.writeFileSync(path, name);
        return path;
    });

    const outcomes = await Promise.allSettled(
        sources.map((source) => STORAGE.move_exclusive(source, destination))
    );

    assert.equal(outcomes.filter((o) => o.status === 'fulfilled').length, 1);
    assert.equal(outcomes.filter((o) => o.status === 'rejected').length, 1);

    /* whoever won, the published bytes are wholly one file - never a blend */
    assert.ok(['first', 'second'].includes(FS.readFileSync(destination, 'utf8')));
});
