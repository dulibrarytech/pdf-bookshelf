'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const CONTROLLER = require('../../pdfs/controller');

const is_view = CONTROLLER._is_document_view;

test('a plain GET for the document is a view', () => {
    assert.equal(is_view({method: 'GET', headers: {}}), true);
});

/*
 * the regression: a PDF reader makes several ranged requests per view, which
 * made the counter track file size instead of readership
 */
test('ranged follow-ups within the same view are not counted', () => {
    assert.equal(is_view({method: 'GET', headers: {range: 'bytes=0-65535'}}), false);
    assert.equal(is_view({method: 'GET', headers: {range: 'bytes=100000-165535'}}), false);
    /* an open-ended range is still a continuation, not a fresh open */
    assert.equal(is_view({method: 'GET', headers: {range: 'bytes=0-'}}), false);
});

test('HEAD is not a read', () => {
    /* express answers HEAD from the GET handler */
    assert.equal(is_view({method: 'HEAD', headers: {}}), false);
});
