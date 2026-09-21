'use strict';

/*
 * The bookshelf table is driven straight from req.query. `sort` reaches an
 * ORDER BY, so it is whitelisted rather than passed through.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const MODEL = require('../../pdfs/model');

const normalize = MODEL._normalize_list_options;
const like_pattern = MODEL._like_pattern;

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

test('removed records are included only on an explicit "1"', () => {

    assert.equal(normalize({removed: '1'}).removed, true);

    /* query-string values are strings; anything else is the default view */
    for (const value of ['0', 'true', 'yes', '', undefined, null, 1, ['1']]) {
        assert.equal(normalize({removed: value}).removed, false, `removed ${JSON.stringify(value)}`);
    }
});

test('an empty query object yields the documented defaults', () => {
    assert.deepEqual(normalize(), {q: '', sort: 'created', dir: 'desc', page: 1, removed: false});
});

/* --- the search term reaches LIKE, whose wildcards must not be the user's to type --- */

test('a plain term is wrapped for a contains match', () => {
    assert.equal(like_pattern('thesis'), '%thesis%');
});

test('LIKE wildcards in the term are escaped, so they match themselves', () => {

    /* the regression: "_" matched every record, "du_mrp" let the underscore stand for anything */
    assert.equal(like_pattern('_'), '%\\_%');
    assert.equal(like_pattern('du_mrp_2026'), '%du\\_mrp\\_2026%');
    assert.equal(like_pattern('50%'), '%50\\%%');
});

test('the escape character itself is escaped', () => {
    assert.equal(like_pattern('a\\b'), '%a\\\\b%');
    assert.equal(like_pattern('\\%'), '%\\\\\\%%');
});
