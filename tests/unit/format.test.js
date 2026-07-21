'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const FORMAT = require('../../libs/format');

test('file_size renders sensible units', () => {
    assert.equal(FORMAT.file_size(0), '0 B');
    assert.equal(FORMAT.file_size(595), '595 B');
    assert.equal(FORMAT.file_size(7534421), '7.2 MB');
    assert.equal(FORMAT.file_size(2147483648), '2.0 GB');
    assert.equal(FORMAT.file_size(null), '0 B');
    assert.equal(FORMAT.file_size('junk'), '0 B');
});

test('date formats and tolerates bad input', () => {
    assert.match(FORMAT.date(new Date('2026-05-27T12:00:00Z')), /May 27, 2026/);
    assert.equal(FORMAT.date(null), '');
    assert.equal(FORMAT.date('not a date'), '');
});
