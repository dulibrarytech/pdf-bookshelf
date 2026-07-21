'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const HMAC = require('../../auth/sso/hmac');

const SECRET = 'test-secret';

function signed_body(overrides = {}) {

    const body = {
        employeeID: '871095226',
        timestamp: '1784500000',
        nonce: 'abcdef0123456789',
        ...overrides
    };

    if (body.signature === undefined) {
        body.signature = HMAC.sign(body.employeeID, body.timestamp, body.nonce, SECRET);
    }

    return body;
}

test('sign/verify roundtrip succeeds', () => {
    assert.equal(HMAC.verify(signed_body(), [SECRET]), true);
});

test('verify accepts the rollover (next) secret', () => {
    assert.equal(HMAC.verify(signed_body(), ['old-secret', SECRET]), true);
});

test('verify rejects a wrong secret', () => {
    assert.throws(() => HMAC.verify(signed_body(), ['wrong-secret']), /Invalid signature/);
});

test('verify rejects a tampered employeeID', () => {
    const body = signed_body();
    body.employeeID = '999999999';
    assert.throws(() => HMAC.verify(body, [SECRET]), /Invalid signature/);
});

test('verify rejects a malformed signature', () => {
    assert.throws(() => HMAC.verify(signed_body({signature: 'nope'}), [SECRET]), /malformed signature/);
});

test('verify rejects a missing signature', () => {
    const body = signed_body();
    delete body.signature;
    assert.throws(() => HMAC.verify(body, [SECRET]), /malformed signature/);
});

test('verify requires timestamp and nonce', () => {
    const body = signed_body();
    delete body.nonce;
    assert.throws(() => HMAC.verify(body, [SECRET]), /Cannot verify signature/);
});

test('verify requires at least one secret', () => {
    assert.throws(() => HMAC.verify(signed_body(), []), /at least one secret/);
});
