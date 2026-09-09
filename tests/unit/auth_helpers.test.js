'use strict';

/* env before any require that touches config */
process.env.TOKEN_SECRET = 'unit-test-secret';
process.env.TOKEN_ISSUER = 'unit-test';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const CONTROLLER = require('../../auth/controller');
const JWT = require('../../libs/jwt');

const FALLBACK = '/bookshelf/dashboard/home';

test('safe_next allows same-app relative paths', () => {
    assert.equal(CONTROLLER._safe_next('/bookshelf/viewer?pdf=abc', FALLBACK), '/bookshelf/viewer?pdf=abc');
});

test('safe_next rejects absolute URLs, protocol-relative, and junk', () => {
    assert.equal(CONTROLLER._safe_next('https://evil.example', FALLBACK), FALLBACK);
    assert.equal(CONTROLLER._safe_next('//evil.example', FALLBACK), FALLBACK);
    assert.equal(CONTROLLER._safe_next('/ok\r\nSet-Cookie: x', FALLBACK), FALLBACK);
    assert.equal(CONTROLLER._safe_next('', FALLBACK), FALLBACK);
    assert.equal(CONTROLLER._safe_next(undefined, FALLBACK), FALLBACK);
    assert.equal(CONTROLLER._safe_next('\\\\evil', FALLBACK), FALLBACK);
});

test('validate_shape accepts a numeric employeeID', () => {
    assert.equal(CONTROLLER._validate_shape({employeeID: '871095226'}), '871095226');
});

test('validate_shape rejects non-numeric and oversized ids', () => {
    assert.throws(() => CONTROLLER._validate_shape({employeeID: 'DROP TABLE'}), /numeric/);
    assert.throws(() => CONTROLLER._validate_shape({employeeID: '12345678901'}), /10 digits/);
    assert.throws(() => CONTROLLER._validate_shape({}), /numeric/);
});

test('jwt sign/verify roundtrip carries the payload', () => {
    const token = JWT.sign({sub: '871095226', tier: 'viewer'});
    const decoded = JWT.verify(token);
    assert.equal(decoded.sub, '871095226');
    assert.equal(decoded.tier, 'viewer');
    assert.equal(decoded.iss, 'unit-test');
});

test('jwt verify rejects a tampered token', () => {
    const token = JWT.sign({sub: '871095226'});
    assert.throws(() => JWT.verify(token.slice(0, -2) + 'xx'));
});

test('jwt extract reads only the session cookie', () => {
    assert.equal(JWT.extract({cookies: {bookshelf_session: 'abc'}}), 'abc');
    assert.equal(JWT.extract({cookies: {}}), null);
    assert.equal(JWT.extract({}), null);
});

/* --- cookie scope (L4) --- */

function recording_res() {
    const calls = [];
    return {
        calls,
        cookie: (name, value, options) => calls.push({type: 'set', name, value, options}),
        clearCookie: (name, options) => calls.push({type: 'clear', name, options})
    };
}

test('the session cookie is scoped to APP_PATH, not the whole domain', () => {

    const res = recording_res();
    JWT.issue_cookie(res, {sub: '871095226', tier: 'viewer'});

    assert.equal(res.calls.length, 1);
    assert.equal(res.calls[0].options.path, '/bookshelf');
    /* the protections that were already right must survive the change */
    assert.equal(res.calls[0].options.httpOnly, true);
    assert.equal(res.calls[0].options.sameSite, 'lax');
});

test('logout clears the APP_PATH cookie and the legacy root one', () => {

    /*
     * a session issued before the scope narrowed is root-scoped; clearing only
     * the APP_PATH cookie would leave the user signed in
     */
    const res = recording_res();
    JWT.clear_cookie(res);

    const paths = res.calls.filter((c) => c.type === 'clear').map((c) => c.options.path);
    assert.deepEqual(paths.sort(), ['/', '/bookshelf']);
});
