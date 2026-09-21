'use strict';

/*
 * The signed sign-in callback, driven over HTTP with the signature layer on
 * - the posture the app will run in once DU IT signs callbacks. Boots with
 * SSO_REQUIRE_FRESHNESS deliberately OFF to prove freshness follows the
 * signature regardless: a stale or replayed signed callback is refused.
 */

process.env.TOKEN_SECRET = 'signed-sso-test-secret-that-is-long-enough';
process.env.TOKEN_ISSUER = 'signed-sso-test';
process.env.APP_PORT = '0';
process.env.SSO_URL = 'https://sso.example.edu/login';
process.env.SSO_RESPONSE_URL = 'http://app.example.edu/bookshelf/sso';
process.env.SSO_REQUIRE_HMAC = '1';
process.env.SSO_HMAC_SECRET = 'integration-shared-secret';
process.env.SSO_REQUIRE_FRESHNESS = '0';
process.env.SSO_MAX_SKEW_SECONDS = '300';

const { test, before, after, mock } = require('node:test');
const assert = require('node:assert/strict');
const CRYPTO = require('node:crypto');

const HMAC = require('../../auth/sso/hmac');
const AUTH_MODEL = require('../../auth/model');

const VIEWER = '900000001';

let app;
let base;

before(async function () {

    mock.method(AUTH_MODEL, 'find_active_user', async () => undefined);

    app = require('../../config/express')();

    await new Promise(function (resolve) {

        if (app.server.listening) {
            resolve();
            return;
        }

        app.server.once('listening', resolve);
    });

    base = `http://127.0.0.1:${app.server.address().port}`;
});

after(function () {
    app.server.close();
});

/**
 * A callback as the identity provider would send it, signed with the shared
 * secret; overrides let a test stale, tamper or strip it.
 */
function callback(overrides = {}) {

    const fields = {
        employeeID: VIEWER,
        timestamp: String(Math.floor(Date.now() / 1000)),
        nonce: CRYPTO.randomBytes(12).toString('hex'),
        ...overrides
    };

    if (!('signature' in overrides)) {
        fields.signature = HMAC.sign(fields.employeeID, fields.timestamp, fields.nonce, process.env.SSO_HMAC_SECRET);
    }

    return fields;
}

function post(fields) {

    return fetch(base + '/bookshelf/sso', {
        method: 'POST',
        headers: {'content-type': 'application/x-www-form-urlencoded', accept: 'text/html'},
        body: new URLSearchParams(Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined))).toString(),
        redirect: 'manual'
    });
}

test('a fresh, correctly signed callback signs the person in', async () => {

    const response = await post(callback());

    assert.equal(response.status, 303);
    assert.match(response.headers.get('location'), /\/bookshelf\/signed-in$/);
    assert.match(response.headers.get('set-cookie'), /bookshelf_session=/);
});

test('an unsigned callback is refused while the signature layer is on', async () => {

    const response = await post(callback({signature: undefined}));

    assert.equal(response.status, 400);
    assert.equal(response.headers.get('set-cookie'), null);
});

test('a tampered callback is refused', async () => {

    const genuine = callback();
    const response = await post({...genuine, employeeID: '900000009'});

    assert.equal(response.status, 401);
    assert.equal(response.headers.get('set-cookie'), null);
});

test('a signed callback is checked for freshness even with SSO_REQUIRE_FRESHNESS off', async () => {

    /*
     * the regression: the flags were independent, so this configuration let
     * a captured signed callback be replayed for as long as the secret lived
     */
    const stale = await post(callback({timestamp: String(Math.floor(Date.now() / 1000) - 600)}));
    assert.equal(stale.status, 401, 'a signed callback ten minutes old must be refused');
    assert.equal(stale.headers.get('set-cookie'), null);

    const genuine = callback();
    assert.equal((await post(genuine)).status, 303, 'the first use of a fresh callback succeeds');

    const replay = await post(genuine);
    assert.equal(replay.status, 401, 'the same callback again is a replay');
    assert.equal(replay.headers.get('set-cookie'), null);
});
