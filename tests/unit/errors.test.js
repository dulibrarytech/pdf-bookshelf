'use strict';

/*
 * describe_error() is the central handler's mapping: what status and message
 * an error that escaped a route turns into, and whether the log should call
 * it expected. The rule it protects: a message reaches the screen only when
 * it is ours or a parser marked it as meant to be shown; anything else is a
 * generic line, whatever the error said.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { describe_error, ValidationError, NotFoundError, ConflictError, AppError } = require('../../libs/errors');

test('our typed refusals keep their status and message', () => {
    assert.deepEqual(describe_error(new ValidationError('Title is required.')), {status: 400, message: 'Title is required.', expected: true});
    assert.deepEqual(describe_error(new NotFoundError('User not found.')), {status: 404, message: 'User not found.', expected: true});
    assert.deepEqual(describe_error(new ConflictError('A user with this DU ID already exists.')), {status: 409, message: 'A user with this DU ID already exists.', expected: true});
});

test("a parser's client error keeps its status, and its message when marked to be shown", () => {

    /* what Express's json/urlencoded parsers throw, via http-errors */
    const too_large = Object.assign(new Error('request entity too large'), {status: 413, statusCode: 413, expose: true, type: 'entity.too.large'});
    assert.deepEqual(describe_error(too_large), {status: 413, message: 'request entity too large', expected: true});

    /* a client error nobody marked as shown gets the status text, not its own words */
    const private_4xx = Object.assign(new Error("Unexpected token 'x' in the secret parser"), {statusCode: 400});
    assert.deepEqual(describe_error(private_4xx), {status: 400, message: 'Bad Request', expected: true});
});

test('anything else is a 500 with a generic line, whatever it said', () => {

    const expected = {status: 500, message: 'An unexpected error occurred.', expected: false};

    assert.deepEqual(describe_error(new Error("connect ECONNREFUSED 127.0.0.1:3306 (password 'hunter2')")), expected);
    assert.deepEqual(describe_error(new AppError('internal detail')), expected);
    assert.deepEqual(describe_error(Object.assign(new Error('gateway'), {status: 502, expose: true})), {status: 502, message: 'An unexpected error occurred.', expected: false});

    /* a status outside the HTTP error range, or no error object at all, is not trusted */
    assert.deepEqual(describe_error(Object.assign(new Error('odd'), {status: 200})), expected);
    assert.deepEqual(describe_error(Object.assign(new Error('odd'), {status: 999})), expected);
    assert.deepEqual(describe_error(null), expected);
    assert.deepEqual(describe_error('a string was thrown'), expected);
});
