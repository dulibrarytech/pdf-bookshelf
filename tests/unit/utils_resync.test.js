'use strict';

/*
 * Re-sync reconciles storage/ with tbl_pdfs. Its decisions are what matter and
 * are easy to get subtly wrong, so they live in a pure plan() the database
 * never touches; scan_storage() is exercised against a real temp directory,
 * and apply() against injected writes so one failure's isolation can be shown.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const FS = require('node:fs');
const PATH = require('node:path');
const OS = require('node:os');
const MODEL = require('../../utils/model');

const scan = MODEL._scan_storage;
const plan = MODEL._plan;
const apply = MODEL._apply;

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

    const dir = storage_with({'report.pdf': 'aaaa', 'Minutes.pdf': 'bb'});
    const { files, skipped } = await scan(dir);

    /* the key keeps the file's own capitalisation: delivery opens <key>.pdf */
    assert.deepEqual([...files.keys()].sort(), ['Minutes', 'report']);
    assert.equal(files.get('report').size, 4);
    assert.equal(files.get('report').name, 'report.pdf');
    assert.deepEqual(skipped, []);
});

test('scanning passes over the staging directory and dotfiles silently', async () => {

    const dir = storage_with({
        'keep.pdf': 'x',
        '.gitkeep': '',
        '.hidden.pdf': 'x',
        '.tmp/staged-upload': 'x'
    });

    const { files, skipped } = await scan(dir);

    /*
     * multer stages into storage/.tmp - a half-written upload is not a PDF
     * on the shelf, and picking it up would create a row for a partial file.
     * None of this is worth a line in the report.
     */
    assert.deepEqual([...files.keys()], ['keep']);
    assert.deepEqual(skipped, []);
});

test('a file that is not a PDF is reported as skipped, not silently ignored', async () => {

    const dir = storage_with({'keep.pdf': 'x', 'notes.txt': 'x', 'archive.pdf.zip': 'x'});
    const { files, skipped } = await scan(dir);

    assert.deepEqual([...files.keys()], ['keep']);
    assert.deepEqual(skipped.map((item) => item.name).sort(), ['archive.pdf.zip', 'notes.txt']);

    for (const item of skipped) {
        assert.match(item.reason, /Not a PDF/);
    }
});

/*
 * the regression: "Minutes.PDF" used to become a record for "Minutes", which
 * delivery opens as Minutes.pdf - a name a case-sensitive server cannot find.
 * The next re-sync then reported it healthy.
 */
test('an extension that is not lowercase .pdf is skipped with the fix, never catalogued', async () => {

    const dir = storage_with({'Minutes.PDF': 'bb', 'Report.Pdf': 'cc', 'fine.pdf': 'dd'});
    const { files, skipped } = await scan(dir);

    assert.deepEqual([...files.keys()], ['fine']);
    assert.deepEqual(skipped.map((item) => item.name).sort(), ['Minutes.PDF', 'Report.Pdf']);

    for (const item of skipped) {
        assert.match(item.reason, /lowercase "\.pdf"/);
        assert.match(item.reason, /Rename the file/);
    }
});

test('an empty storage directory scans to nothing rather than failing', async () => {
    const { files, skipped } = await scan(storage_with({}));
    assert.equal(files.size, 0);
    assert.deepEqual(skipped, []);
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

/*
 * tbl_pdfs compares filenames case-insensitively (utf8mb4_unicode_ci), so an
 * INSERT of "Minutes" beside a "minutes" row fails on the unique index - and
 * on Linux the two are different files, so the record's own file really is
 * absent
 */
test('a file differing from a record only in capitalisation is skipped, with the record named', () => {

    const files = new Map([file('Minutes.pdf', 10)]);
    const rows = [{id: 7, filename: 'minutes', file_size: 10, sha256: 'abc', is_active: 1}];
    const result = plan(files, rows);

    assert.deepEqual(result.add, []);
    assert.equal(result.skipped.length, 1);
    assert.equal(result.skipped[0].name, 'Minutes.pdf');
    assert.match(result.skipped[0].reason, /"minutes\.pdf"/);
    /* and the record is still reported missing, because its file is */
    assert.deepEqual(result.missing, ['minutes.pdf']);
});

test('an exact-case match is the same record, not a conflict', () => {

    const files = new Map([file('Minutes.pdf', 10)]);
    const rows = [{id: 7, filename: 'Minutes', file_size: 10, sha256: 'abc', is_active: 1}];
    const result = plan(files, rows);

    assert.deepEqual(result.skipped, []);
    assert.deepEqual(result.add, []);
    assert.deepEqual(result.missing, []);
});

test('a realistic mixed run sorts every case into the right bucket', () => {

    const files = new Map([file('fresh.pdf', 5), file('grew.pdf', 900), file('same.pdf', 10), file('Gone.pdf', 10)]);
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
    assert.deepEqual(result.skipped.map((s) => s.name), ['Gone.pdf']);
});

/* --- applying, one entry at a time --- */

test('one failed write is reported and the rest of the run still lands', async () => {

    /*
     * the regression: a single failed INSERT threw out of the loop with the
     * entries before it already committed and only "Re-sync failed." to show
     */
    const dir = storage_with({'first.pdf': 'aaaa', 'second.pdf': 'bb', 'grew.pdf': 'ccc'});
    const planned = {
        add: [
            {filename: 'first', file: {name: 'first.pdf', size: 4}},
            {filename: 'second', file: {name: 'second.pdf', size: 2}}
        ],
        remeasure: [{id: 9, filename: 'grew', file: {name: 'grew.pdf', size: 3}}]
    };
    const inserted = [];
    const updated = [];

    const result = await apply(dir, planned, {
        insert: async (row) => {

            if (row.filename === 'first') {
                const error = new Error("Duplicate entry 'first' for key 'idx_pdfs_filename'");
                error.code = 'ER_DUP_ENTRY';
                throw error;
            }

            inserted.push(row);
        },
        update: async (id, fields) => {
            updated.push({id, fields});
        }
    });

    assert.deepEqual(result.added, ['second.pdf']);
    assert.deepEqual(result.updated, ['grew.pdf']);
    assert.equal(result.failed.length, 1);
    assert.equal(result.failed[0].name, 'first.pdf');
    /* the database's own message names an index; the report names the fix */
    assert.match(result.failed[0].message, /case- and accent-insensitively/);

    /* the rows it did write carry what delivery and re-measure need */
    assert.equal(inserted[0].filename, 'second');
    assert.equal(inserted[0].title, 'second');
    assert.equal(inserted[0].file_size, 2);
    assert.match(inserted[0].sha256, /^[0-9a-f]{64}$/);
    assert.match(inserted[0].uuid, /^[0-9a-f-]{36}$/);
    assert.equal(updated[0].id, 9);
    assert.equal(updated[0].fields.file_size, 3);
    assert.match(updated[0].fields.sha256, /^[0-9a-f]{64}$/);
});

test('a file that vanishes between scan and hash fails on its own, not the run', async () => {

    const dir = storage_with({'present.pdf': 'aaaa'});
    const planned = {
        add: [
            {filename: 'gone', file: {name: 'gone.pdf', size: 1}},
            {filename: 'present', file: {name: 'present.pdf', size: 4}}
        ],
        remeasure: []
    };

    const result = await apply(dir, planned, {insert: async () => {}, update: async () => {}});

    assert.deepEqual(result.added, ['present.pdf']);
    assert.equal(result.failed.length, 1);
    assert.equal(result.failed[0].name, 'gone.pdf');
    assert.match(result.failed[0].message, /ENOENT/);
});

/* --- one run at a time, watched rather than waited on --- */

const start = MODEL._start_with;
const settle = () => new Promise((resolve) => setImmediate(resolve));

/** a run the test finishes or fails by hand, after reporting some progress */
function controllable_run() {

    const handle = {};

    handle.run = (job) => new Promise(function (resolve, reject) {
        job.scanned = 3;
        job.progress.total = 2;
        job.progress.done = 1;
        handle.finish = resolve;
        handle.fail = reject;
    });

    return handle;
}

const REPORT = {scanned: 3, added: ['new.pdf'], updated: [], missing: [], skipped: [], failed: []};

test('a second start while a run is in progress joins it instead of racing it', async () => {

    /*
     * the regression: two administrators clicking at once ran two
     * reconciliations that raced on the filename index
     */
    MODEL._reset_job();
    const first = controllable_run();

    const a = start(3, first.run);
    const b = start(18, () => { throw new Error('a second run must not start'); });

    assert.equal(a.joined, false);
    assert.equal(b.joined, true);
    assert.equal(b.job, a.job);
    assert.equal(MODEL.status(), a.job);

    /* the run reports as it goes, and is not finished until it is */
    assert.equal(a.job.scanned, 3);
    assert.deepEqual(a.job.progress, {done: 1, total: 2});
    assert.equal(a.job.finished_at, null);

    first.finish(REPORT);
    await settle();

    assert.notEqual(a.job.finished_at, null);
    assert.deepEqual(a.job.report, REPORT);
    assert.equal(a.job.error, null);
    assert.equal(a.job.started_by, 3);
});

test('once a run has finished, the next start is a new run', async () => {

    MODEL._reset_job();
    const first = controllable_run();
    const a = start(3, first.run);
    first.finish(REPORT);
    await settle();

    const second = controllable_run();
    const b = start(18, second.run);

    assert.equal(b.joined, false);
    assert.notEqual(b.job, a.job);
    assert.equal(MODEL.status(), b.job);
    assert.equal(b.job.report, null);

    second.finish(REPORT);
    await settle();
    assert.equal(b.job.started_by, 18);
});

test('a run that fails records the failure and still finishes, so the next start is allowed', async () => {

    MODEL._reset_job();
    const broken = controllable_run();
    const a = start(3, broken.run);

    broken.fail(new Error('connect ECONNREFUSED'));
    await settle();

    assert.notEqual(a.job.finished_at, null);
    assert.equal(a.job.report, null);
    assert.equal(a.job.error, 'connect ECONNREFUSED');
    assert.equal(start(3, controllable_run().run).joined, false);
    MODEL._reset_job();
});

test('apply reports progress after every entry, whether it landed or failed', async () => {

    const dir = storage_with({'ok.pdf': 'aaaa', 'bad.pdf': 'bb'});
    const planned = {
        add: [{filename: 'ok', file: {name: 'ok.pdf', size: 4}}, {filename: 'bad', file: {name: 'bad.pdf', size: 2}}],
        remeasure: []
    };
    const seen = [];

    await apply(dir, planned, {
        insert: async (row) => { if (row.filename === 'bad') { throw new Error('nope'); } },
        update: async () => {}
    }, (done, total) => seen.push([done, total]));

    assert.deepEqual(seen, [[1, 2], [2, 2]]);
});
