'use strict';

/* env before any require that touches config */
process.env.TOKEN_SECRET = 'unit-test-secret';
process.env.TOKEN_ISSUER = 'unit-test';
process.env.SSO_URL = 'https://sso.example.edu/login';
process.env.SSO_RESPONSE_URL = 'http://app.example.edu/bookshelf/sso';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const CONTROLLER = require('../../auth/controller');
const JWT = require('../../libs/jwt');
const { same_origin } = require('../../libs/origin');

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

/* --- /login: what rides along to the identity provider --- */

function redirecting_res() {

    const res = {status_code: null, location: null};

    res.redirect = (status, url) => { res.status_code = status; res.location = url; };
    res.status = (code) => { res.status_code = code; return res; };
    res.render = () => res;

    return res;
}

/* the app_url the identity provider will POST back to, as a URL */
function app_url_of(location) {
    return new URL(new URL(location).searchParams.get('app_url'));
}

test('/login without a target sends none, so the callback can route by tier', () => {

    /*
     * the regression: a default of /dashboard/home here sent every viewer -
     * the app's largest population - to "You do not have access" after
     * signing in through /login or the root redirect
     */
    const res = redirecting_res();
    CONTROLLER.sso_start({query: {}}, res);

    assert.equal(res.status_code, 302);
    assert.equal(new URL(res.location).origin, 'https://sso.example.edu');

    const app_url = app_url_of(res.location);
    assert.equal(app_url.origin + app_url.pathname, 'http://app.example.edu/bookshelf/sso');
    assert.equal(app_url.searchParams.has('next'), false);
});

test('/login keeps a safe target and drops an unsafe one', () => {

    let res = redirecting_res();
    CONTROLLER.sso_start({query: {next: '/bookshelf/viewer?pdf=abc'}}, res);
    assert.equal(app_url_of(res.location).searchParams.get('next'), '/bookshelf/viewer?pdf=abc');

    res = redirecting_res();
    CONTROLLER.sso_start({query: {next: 'https://evil.example/'}}, res);
    assert.equal(app_url_of(res.location).searchParams.has('next'), false);
});

test('the sign-in retry link goes back through /login with the same target', () => {

    assert.equal(
        CONTROLLER.retry_sign_in_url({query: {next: '/bookshelf/viewer?pdf=abc'}, body: {}}),
        '/bookshelf/login?next=%2Fbookshelf%2Fviewer%3Fpdf%3Dabc'
    );
    assert.equal(CONTROLLER.retry_sign_in_url({query: {}, body: {}}), '/bookshelf/login');
    assert.equal(CONTROLLER.retry_sign_in_url({query: {next: '//evil.example'}, body: {}}), '/bookshelf/login');
});

/* --- who may change state: sign-out, and every dashboard action --- */

function request_with(headers) {
    const lower = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
    return {get: (name) => lower[name.toLowerCase()]};
}

test('a browser that names the origin of a request decides it', () => {

    /* our own form, and an address the person typed */
    assert.equal(same_origin(request_with({'sec-fetch-site': 'same-origin'})), true);
    assert.equal(same_origin(request_with({'sec-fetch-site': 'none'})), true);

    /* a form on someone else's page - even one on a sibling DU host */
    assert.equal(same_origin(request_with({'sec-fetch-site': 'cross-site', origin: 'http://localhost:8005', host: 'localhost:8005'})), false);
    assert.equal(same_origin(request_with({'sec-fetch-site': 'same-site'})), false);
});

test('without Sec-Fetch-Site, Origin is compared to the host we were reached at', () => {

    assert.equal(same_origin(request_with({origin: 'https://bookshelf.library.du.edu', host: 'bookshelf.library.du.edu'})), true);
    assert.equal(same_origin(request_with({origin: 'http://localhost:8005', host: 'localhost:8005'})), true);
    assert.equal(same_origin(request_with({origin: 'https://evil.example', host: 'bookshelf.library.du.edu'})), false);
    assert.equal(same_origin(request_with({origin: 'null', host: 'bookshelf.library.du.edu'})), false);
    assert.equal(same_origin(request_with({origin: 'not a url', host: 'x'})), false);

    /* behind a proxy that names the outside host that way */
    assert.equal(same_origin(request_with({origin: 'https://bookshelf.library.du.edu', 'x-forwarded-host': 'bookshelf.library.du.edu', host: 'localhost:8005'})), true);
    assert.equal(same_origin(request_with({origin: 'https://evil.example', 'x-forwarded-host': 'bookshelf.library.du.edu', host: 'localhost:8005'})), false);
});

test('a request that names no origin is not a browser form, so it may proceed', () => {
    assert.equal(same_origin(request_with({host: 'localhost:8005'})), true);
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
