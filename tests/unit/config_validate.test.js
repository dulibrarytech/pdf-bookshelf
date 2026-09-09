'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const VALIDATE = require('../../config/validate');

/* a configuration with nothing wrong with it */
function good(overrides = {}) {
    return Object.assign({
        app_name: 'PDF Bookshelf @ DU',
        app_port: 8005,
        token_secret: 'x'.repeat(64),
        token_algo: 'HS512',
        db_user: 'bookshelf',
        db_password: 'secret',
        storage_path: './storage',
        app_path: '/bookshelf',
        sso_url: 'https://sso.example.edu',
        sso_require_hmac: true,
        sso_require_freshness: true,
        sso_hmac_secret: 'shared-secret',
        sso_host: 'sso.du.edu',
        sso_hmac_secret_next: undefined
    }, overrides);
}

const always = () => true;
const never = () => false;

function inspect(overrides, directory_exists = always) {
    return VALIDATE.inspect(good(overrides), directory_exists);
}

test('a complete configuration produces nothing', () => {
    const { fatal, warnings } = inspect({});
    assert.deepEqual(fatal, []);
    assert.deepEqual(warnings, []);
});

/*
 * the regression this exists for: the app used to boot fine without a secret
 * and fail every sign-in with a generic error
 */
test('a missing TOKEN_SECRET is fatal', () => {
    for (const value of [undefined, '', '   ']) {
        const { fatal } = inspect({token_secret: value});
        assert.equal(fatal.length, 1, `expected fatal for ${JSON.stringify(value)}`);
        assert.match(fatal[0], /TOKEN_SECRET/);
    }
});

test('a short TOKEN_SECRET warns but still boots', () => {
    const { fatal, warnings } = inspect({token_secret: 'too-short'});
    assert.deepEqual(fatal, []);
    assert.match(warnings[0], /TOKEN_SECRET is shorter/);
});

test('an unsupported TOKEN_ALGO is fatal', () => {
    /* RS256 needs a key pair, not the shared string we hold */
    assert.match(inspect({token_algo: 'RS256'}).fatal[0], /TOKEN_ALGO/);
    assert.match(inspect({token_algo: 'HS512 '}).fatal[0], /TOKEN_ALGO/);
    assert.deepEqual(inspect({token_algo: 'HS256'}).fatal, []);
});

test('a missing DB_USER is fatal, an empty DB_PASSWORD only warns', () => {
    assert.match(inspect({db_user: ''}).fatal[0], /DB_USER/);

    const { fatal, warnings } = inspect({db_password: ''});
    assert.deepEqual(fatal, []);
    assert.match(warnings[0], /DB_PASSWORD/);
});

test('a STORAGE_PATH that is not a directory is fatal', () => {
    const { fatal } = inspect({}, never);
    assert.equal(fatal.length, 1);
    assert.match(fatal[0], /STORAGE_PATH/);
});

test('requiring HMAC without any secret is fatal', () => {

    const no_secret = {sso_require_hmac: true, sso_hmac_secret: '', sso_hmac_secret_next: ''};
    assert.match(inspect(no_secret).fatal[0], /SSO_HMAC_SECRET/);

    /* either secret satisfies it - the rollover pair is interchangeable */
    assert.deepEqual(inspect({...no_secret, sso_hmac_secret: 's'}).fatal, []);
    assert.deepEqual(inspect({...no_secret, sso_hmac_secret_next: 's'}).fatal, []);
});

test('an unusable APP_PORT is fatal', () => {
    for (const port of ['not-a-port', 0, 70000, 1.5]) {
        assert.match(inspect({app_port: port}).fatal[0], /APP_PORT/);
    }
    /* env values arrive as strings */
    assert.deepEqual(inspect({app_port: '8005'}).fatal, []);
});

test('a malformed APP_PATH is fatal', () => {

    /* every route and asset URL is built by concatenating this */
    assert.match(inspect({app_path: 'bookshelf'}).fatal[0], /must start with/);
    assert.match(inspect({app_path: '/bookshelf/'}).fatal[0], /must not end with/);
    assert.match(inspect({app_path: '/'}).fatal[0], /must not end with/);
});

test('APP_PATH accepts a nested path, and empty for a root mount', () => {

    for (const app_path of ['/bookshelf', '/library/bookshelf', '']) {
        assert.deepEqual(inspect({app_path: app_path}).fatal, [], `app_path ${JSON.stringify(app_path)}`);
    }
});

test('disabled SSO verification warns loudly but never blocks the boot', () => {

    /*
     * both layers are off by design until DU IT signs callbacks - the app must
     * still start, but must not stay quiet about it
     */
    const { fatal, warnings } = inspect({sso_require_hmac: false, sso_require_freshness: false});

    assert.deepEqual(fatal, []);
    assert.ok(warnings.some((w) => /NOT signature-verified/.test(w)), 'expected an HMAC warning');
    assert.ok(warnings.some((w) => /NOT checked for freshness/.test(w)), 'expected a freshness warning');
});

test('with HMAC off, the warning names SSO_HOST as the only remaining gate', () => {

    const configured = inspect({sso_require_hmac: false}).warnings.join(' ');
    assert.match(configured, /sso\.du\.edu/);

    /* and escalates when even that is missing */
    const unguarded = inspect({sso_require_hmac: false, sso_host: ''}).warnings.join(' ');
    assert.match(unguarded, /nothing narrows who may post an identity/);
});

test('fully configured SSO verification produces no warning at all', () => {
    assert.deepEqual(inspect({}).warnings, []);
});

test('a missing SSO_URL warns rather than blocking the boot', () => {
    const { fatal, warnings } = inspect({sso_url: ''});
    assert.deepEqual(fatal, []);
    assert.match(warnings[0], /SSO_URL/);
});

test('every problem is reported in one pass', () => {
    const { fatal } = inspect({token_secret: '', token_algo: 'nope', db_user: '', app_port: 'x', app_path: 'nope/'}, never);
    assert.equal(fatal.length, 7);
});
