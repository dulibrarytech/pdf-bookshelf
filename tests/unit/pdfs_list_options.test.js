'use strict';

/*
 * The bookshelf table is driven straight from req.query. `sort` reaches an
 * ORDER BY, so it is whitelisted rather than passed through.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const MODEL = require('../../pdfs/model');

const normalize = MODEL._normalize_list_options;

test('the sortable columns are accepted as given', () => {
    for (const sort of ['title', 'filename', 'file_size', 'hits', 'created']) {
        assert.equal(normalize({sort: sort}).sort, sort);
    }
});

test('anything not on the whitelist falls back to created', () => {

    /* the injection shape this guards: a column expression reaching ORDER BY */
    const attempts = [
        'id; DROP TABLE tbl_pdfs',
        '(SELECT password FROM tbl_users)',
        'hits, (SELECT 1)',
        'HITS',
        'uuid',
        '',
        undefined,
        null,
        42,
        ['hits']
    ];

    for (const sort of attempts) {
        assert.equal(normalize({sort: sort}).sort, 'created', `sort ${JSON.stringify(sort)}`);
    }
});

test('direction is asc only when asked for exactly, otherwise desc', () => {
    assert.equal(normalize({dir: 'asc'}).dir, 'asc');
    for (const dir of ['desc', 'ASC', 'ascending', '', undefined, 'asc; --']) {
        assert.equal(normalize({dir: dir}).dir, 'desc', `dir ${JSON.stringify(dir)}`);
    }
});

test('page is a positive integer, whatever arrives', () => {

    assert.equal(normalize({page: '3'}).page, 3);
    assert.equal(normalize({page: 1}).page, 1);

    /* 0, negatives and junk must not produce a negative OFFSET */
    for (const page of ['0', '-5', 'abc', '', undefined, null, {}]) {
        assert.equal(normalize({page: page}).page, 1, `page ${JSON.stringify(page)}`);
    }

    /* parseInt semantics are relied on for "2junk" - documented, not accidental */
    assert.equal(normalize({page: '2junk'}).page, 2);
});

test('the search term is trimmed, and non-strings become empty', () => {

    assert.equal(normalize({q: '  thesis  '}).q, 'thesis');

    for (const q of [undefined, null, 42, ['x'], {}]) {
        assert.equal(normalize({q: q}).q, '', `q ${JSON.stringify(q)}`);
    }
});

test('an empty query object yields the documented defaults', () => {
    assert.deepEqual(normalize(), {q: '', sort: 'created', dir: 'desc', page: 1});
});
