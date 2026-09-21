'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const VALIDATE = require('../../config/validate');

/* a configuration with nothing wrong with it */
function good(overrides = {}) {
    return Object.assign({
        app_name: 'PDF Bookshelf @ DU',
        node_env: 'production',
        app_host: 'localhost',
        app_port: 8005,
        sso_response_url: 'https://localhost/bookshelf/sso',
        token_secret: 'x'.repeat(64),
        token_algo: 'HS512',
        token_expires: '12h',
        db_user: 'bookshelf',
        db_password: 'secret',
        storage_path: './storage',
        app_path: '/bookshelf',
        sso_url: 'https://sso.example.edu',
        sso_require_hmac: true,
        sso_require_freshness: true,
        sso_hmac_secret: 'shared-secret',
        sso_host: 'sso.du.edu',
        sso_hmac_secret_next: undefined,
        sso_rate_limit_per_minute: 300,
        trust_proxy: 'loopback'
    }, overrides);
}

const always = () => true;
const never = () => false;

function inspect(overrides, directory_exists = always, file_exists = always) {
    return VALIDATE.inspect(good(overrides), directory_exists, file_exists);
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

/* --- TOKEN_EXPIRES: the value goes straight to jsonwebtoken, so the rule asks jsonwebtoken --- */

test('TOKEN_EXPIRES: a timespan jsonwebtoken understands passes quietly, up to a week', () => {
    for (const value of ['12h', '30m', '2 days', '7d', '1 hour', '12hours']) {
        const { fatal, warnings } = inspect({token_expires: value});
        assert.deepEqual(fatal, [], `token_expires ${JSON.stringify(value)}`);
        assert.deepEqual(warnings, [], `token_expires ${JSON.stringify(value)}`);
    }
});

test('TOKEN_EXPIRES: a value jsonwebtoken cannot parse is fatal - it used to fail every sign-in instead', () => {
    for (const value of ['twelve', '12hh', '   ', 'later', undefined]) {
        const { fatal } = inspect({token_expires: value});
        assert.match(fatal[0], /TOKEN_EXPIRES/, `token_expires ${JSON.stringify(value)}`);
        assert.match(fatal[0], /not a timespan/, `token_expires ${JSON.stringify(value)}`);
    }
});

test('TOKEN_EXPIRES: a bare number is fatal, because jsonwebtoken reads it as milliseconds', () => {

    /* "3600" is a three-second session - a sign-in loop, not an hour */
    const { fatal } = inspect({token_expires: '3600'});

    assert.equal(fatal.length, 1);
    assert.match(fatal[0], /milliseconds/);
    assert.match(fatal[0], /a 3-second session/);
    assert.match(fatal[0], /"3600s"/);
});

test('TOKEN_EXPIRES: a session too short to outlast the sign-in redirect is fatal', () => {
    for (const value of ['30s', '1000ms', '-1h']) {
        assert.match(inspect({token_expires: value}).fatal[0], /cannot outlast the sign-in redirect/, `token_expires ${JSON.stringify(value)}`);
    }
});

test('TOKEN_EXPIRES: longer than a week warns but boots', () => {

    const { fatal, warnings } = inspect({token_expires: '30d'});

    assert.deepEqual(fatal, []);
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /30 days/);
    assert.match(warnings[0], /stays valid that long even after sign-out/);
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

test('missing vendored client assets are fatal, and the message names the fix', () => {

    /*
     * public/libs is not in git; a deploy that skipped the postinstall hook
     * used to serve the dashboard unstyled and inert with nothing saying why
     */
    const { fatal } = inspect({}, always, never);

    assert.equal(fatal.length, 1);
    assert.match(fatal[0], /bootstrap\.min\.css/);
    assert.match(fatal[0], /bootstrap\.bundle\.min\.js/);
    assert.match(fatal[0], /htmx\.min\.js/);
    assert.match(fatal[0], /npm run vendor/);
    /* source maps are not load-bearing, so their absence is not a reason to refuse */
    assert.doesNotMatch(fatal[0], /\.map/);
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

test('HMAC on with the freshness flag off is named as the contradiction it is, not as "unchecked"', () => {

    /*
     * the regression: the two flags were independent, so a signed callback
     * could be configured to never be checked for freshness - replayable for
     * as long as the secret lived. Freshness now follows the signature.
     */
    const { fatal, warnings } = inspect({sso_require_hmac: true, sso_require_freshness: false});

    assert.deepEqual(fatal, []);
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /SSO_REQUIRE_FRESHNESS is off but SSO_REQUIRE_HMAC is on/);
    assert.match(warnings[0], /always checked/);
    assert.doesNotMatch(warnings[0], /NOT checked/);
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

test('an unusable sign-in rate limit is fatal', () => {

    /* the limiter would otherwise quietly refuse everyone (0) or nobody (NaN) */
    for (const value of [0, -5, 1.5, NaN, '300']) {
        assert.match(inspect({sso_rate_limit_per_minute: value}).fatal[0], /SSO_RATE_LIMIT_PER_MINUTE/, `limit ${JSON.stringify(value)}`);
    }

    assert.deepEqual(inspect({sso_rate_limit_per_minute: 1}).fatal, []);
    assert.deepEqual(inspect({sso_rate_limit_per_minute: 5000}).fatal, []);
});

test('TRUST_PROXY accepts what Express does and refuses what would crash it', () => {

    for (const value of ['loopback', 'loopback, 10.0.0.5', '10.0.0.0/8', 'fd00::/8', '::1', true, false, 0, 2]) {
        assert.deepEqual(inspect({trust_proxy: value}).fatal, [], `trust_proxy ${JSON.stringify(value)}`);
    }

    /* each of these makes app.set('trust proxy') throw a bare stack trace */
    for (const value of ['garbage', '10.0.0.999', '10.0.0.0/40', 'loopback,nope', '', 1.5, undefined]) {
        assert.match(inspect({trust_proxy: value}).fatal[0], /TRUST_PROXY/, `trust_proxy ${JSON.stringify(value)}`);
    }
});

/* --- NODE_ENV on a deployed host --- */

test('a deployed host without NODE_ENV=production warns, naming what gave it away', () => {

    /* the identity provider is told to post sign-ins to a real machine */
    const by_callback = inspect({node_env: 'development', sso_response_url: 'https://bookshelf.library.du.edu/bookshelf/sso'});
    assert.deepEqual(by_callback.fatal, []);
    assert.equal(by_callback.warnings.length, 1);
    assert.match(by_callback.warnings[0], /NODE_ENV is "development" but SSO_RESPONSE_URL sends sign-ins to bookshelf\.library\.du\.edu/);
    assert.match(by_callback.warnings[0], /not marked Secure/);

    /* or APP_HOST names one */
    const by_host = inspect({node_env: 'development', app_host: 'bookshelf.library.du.edu'});
    assert.match(by_host.warnings[0], /APP_HOST is bookshelf\.library\.du\.edu/);
});

test('a development machine is not nagged, however it is addressed', () => {

    for (const url of ['https://localhost/bookshelf/sso', 'http://127.0.0.1:8005/bookshelf/sso', 'http://[::1]:8005/bookshelf/sso', 'http://app.localhost/bookshelf/sso', '', undefined, 'not a url']) {
        const { warnings } = inspect({node_env: 'development', sso_response_url: url, app_host: 'localhost'});
        assert.deepEqual(warnings.filter((w) => /NODE_ENV/.test(w)), [], `sso_response_url ${JSON.stringify(url)}`);
    }

    assert.deepEqual(inspect({node_env: 'development', app_host: '0.0.0.0'}).warnings, []);
});

test('with NODE_ENV=production there is nothing to say', () => {
    assert.deepEqual(inspect({node_env: 'production', sso_response_url: 'https://bookshelf.library.du.edu/bookshelf/sso', app_host: 'bookshelf.library.du.edu'}).warnings, []);
});

/* --- a server that cannot listen --- */

test('a port in use, or one that needs privileges, is explained in one line', () => {

    const describe = VALIDATE.describe_listen_error;

    assert.match(describe(Object.assign(new Error('listen EADDRINUSE: address already in use :::8005'), {code: 'EADDRINUSE'}), 8005), /port 8005 is already in use.*APP_PORT/);
    assert.match(describe(Object.assign(new Error('listen EACCES: permission denied 0.0.0.0:80'), {code: 'EACCES'}), 80), /port 80 needs privileges.*below 1024/);

    /* anything else names the code, or the message when there is none */
    assert.match(describe(Object.assign(new Error('boom'), {code: 'ENOTSUP'}), 8005), /could not listen on port 8005: ENOTSUP/);
    assert.match(describe(new Error('something odd'), 8005), /could not listen on port 8005: something odd/);
});

test('every problem is reported in one pass', () => {
    const { fatal } = inspect({token_secret: '', token_algo: 'nope', db_user: '', app_port: 'x', app_path: 'nope/'}, never);
    assert.equal(fatal.length, 7);
});
