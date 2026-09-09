'use strict';

/*
 * The authorization boundary, tested two ways.
 *
 *   1. Inventory - every route the app registers is checked against a declared
 *      table of what guards it. A route added without a guard, or with the
 *      wrong one, fails here rather than shipping open. This is the half that
 *      protects the app from future changes.
 *
 *   2. Behaviour - the real app is booted and driven over HTTP as an anonymous
 *      caller, a signed-in viewer with no dashboard row, a staff user, and an
 *      admin. This is the half that proves the guards actually enforce.
 *
 * The suite is hermetic: models are stubbed at their module boundary, so it
 * needs no database and touches no real data.
 */

process.env.TOKEN_SECRET = 'rbac-route-test-secret-that-is-long-enough';
process.env.TOKEN_ISSUER = 'rbac-test';
/* 0 = ephemeral, so this never collides with a running dev server */
process.env.APP_PORT = '0';

const { test, before, after, mock } = require('node:test');
const assert = require('node:assert/strict');

const JWT = require('../../libs/jwt');
const AUTH_MODEL = require('../../auth/model');
const PDFS_MODEL = require('../../pdfs/model');
const DASHBOARD_MODEL = require('../../dashboard/model');
const USERS_MODEL = require('../../users/model');
const UTILS_MODEL = require('../../utils/model');

const VIEWER = '900000001';
const STAFF = '900000002';
const ADMIN = '900000003';

const ROWS = {
    [STAFF]: {id: 2, du_id: STAFF, email: 's@du.edu', first_name: 'Sam', last_name: 'Staff', role: 'staff'},
    [ADMIN]: {id: 3, du_id: ADMIN, email: 'a@du.edu', first_name: 'Ada', last_name: 'Admin', role: 'admin'}
};

const PDF_ROW = {
    id: 1, uuid: '11111111-2222-3333-4444-555555555555', filename: 'doc',
    title: 'Doc', file_size: 10, hits: 0, created: new Date()
};

let app;
let base;

before(async function () {

    /* the only database call the guards make */
    mock.method(AUTH_MODEL, 'find_active_user', async (du_id) => ROWS[String(du_id)]);

    /*
     * handlers behind the guards - stubbed so an allowed request proves the
     * guard let it through without needing a database
     */
    mock.method(PDFS_MODEL, 'get_by_uuid', async () => PDF_ROW);
    mock.method(PDFS_MODEL, 'get_by_filename', async () => PDF_ROW);
    mock.method(PDFS_MODEL, 'list', async () => ({rows: [], total: 0, page: 1, page_count: 1, q: '', sort: 'created', dir: 'desc'}));
    mock.method(PDFS_MODEL, 'update_title', async () => 1);
    mock.method(PDFS_MODEL, 'deactivate', async () => 1);
    mock.method(PDFS_MODEL, 'increment_hits', () => undefined);
    mock.method(DASHBOARD_MODEL, 'get_stats', async () => ({total_pdfs: 0, most_accessed_file: 'none', total_hits: 0}));
    mock.method(USERS_MODEL, 'list', async () => []);
    mock.method(USERS_MODEL, 'get', async () => ROWS[STAFF]);
    mock.method(USERS_MODEL, 'update', async () => ROWS[STAFF]);
    mock.method(USERS_MODEL, 'set_active', async () => ROWS[STAFF]);
    mock.method(UTILS_MODEL, 'resync', async () => ({scanned: 0, added: [], updated: [], missing: []}));

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

function session(du_id) {
    return `bookshelf_session=${JWT.sign({sub: du_id, tier: 'viewer'})}`;
}

/**
 * @param who a du_id, or null for an anonymous caller
 * @param options {htmx: true} to send the header htmx sets on its requests
 */
function call(method, path, who, options = {}) {

    const headers = {accept: 'text/html'};

    if (who !== null) {
        headers.cookie = session(who);
    }

    if (options.htmx === true) {
        headers['hx-request'] = 'true';
    }

    return fetch(base + path, {method: method, headers: headers, redirect: 'manual'});
}

/* ---------------------------------------------------------------- 1. inventory */

/*
 * Every route the app registers, and what must guard it. Public entries are
 * listed explicitly with '' so that opening a new route to the world is a
 * deliberate edit here, not an omission somewhere else.
 */
const EXPECTED = {
    'GET /bookshelf/login': '',
    'POST /bookshelf/sso': '',
    'GET /bookshelf/signed-in': '',
    'GET /bookshelf/logout': '',
    'GET /bookshelf/': '',
    'GET /bookshelf/healthcheck': '',
    'GET /bookshelf/robots.txt': '',
    'GET /viewer': '',
    'GET /pdf/:filename': '',

    'GET /bookshelf/viewer': 'viewer',
    'GET /bookshelf/pdf/:id': 'viewer',

    'GET /bookshelf/dashboard/home': 'dashboard',
    'GET /bookshelf/dashboard/pdfs': 'dashboard',
    'GET /bookshelf/dashboard/pdfs/:uuid/row': 'dashboard',
    'GET /bookshelf/dashboard/pdfs/:uuid/edit': 'dashboard',
    'PUT /bookshelf/dashboard/pdfs/:uuid': 'dashboard',
    'GET /bookshelf/dashboard/upload': 'dashboard',
    'POST /bookshelf/dashboard/uploads': 'dashboard',

    'DELETE /bookshelf/dashboard/pdfs/:uuid': 'dashboard:admin',
    'GET /bookshelf/dashboard/users': 'dashboard:admin',
    'POST /bookshelf/dashboard/users': 'dashboard:admin',
    'GET /bookshelf/dashboard/users/:id/row': 'dashboard:admin',
    'GET /bookshelf/dashboard/users/:id/edit': 'dashboard:admin',
    'PUT /bookshelf/dashboard/users/:id': 'dashboard:admin',
    'DELETE /bookshelf/dashboard/users/:id': 'dashboard:admin',
    'POST /bookshelf/dashboard/users/:id/reactivate': 'dashboard:admin',
    'GET /bookshelf/dashboard/utils': 'dashboard:admin',
    'POST /bookshelf/dashboard/utils/resync': 'dashboard:admin'
};

/**
 * Reads the protection off the router stack. Guards carry tier/roles metadata
 * (see auth/middleware.js) so this reports what is wired, not what we hope is.
 */
function registered_routes() {

    const found = {};

    for (const layer of app.router.stack) {

        if (layer.route === undefined) {
            continue;
        }

        for (const method of Object.keys(layer.route.methods)) {

            const guards = layer.route.stack
                .filter((entry) => entry.method === undefined || entry.method === method)
                .map((entry) => entry.handle)
                .filter((handle) => handle.tier !== undefined)
                .map((handle) => handle.roles.length > 0 ? `${handle.tier}:${handle.roles.join('|')}` : handle.tier);

            found[`${method.toUpperCase()} ${layer.route.path}`] = guards.join(' ');
        }
    }

    return found;
}

test('every registered route carries the guard it is supposed to', () => {

    const found = registered_routes();

    /* a route nobody declared - most likely a new one that forgot its guard */
    const undeclared = Object.keys(found).filter((route) => EXPECTED[route] === undefined);
    assert.deepEqual(undeclared, [], 'routes missing from the expected table');

    /* a declared route that disappeared or was renamed */
    const missing = Object.keys(EXPECTED).filter((route) => found[route] === undefined);
    assert.deepEqual(missing, [], 'expected routes that are no longer registered');

    for (const route of Object.keys(EXPECTED)) {
        assert.equal(found[route], EXPECTED[route], `wrong guard on ${route}`);
    }
});

/* --------------------------------------------------------------- 2. behaviour */

const DASHBOARD_ROUTES = [
    ['GET', '/bookshelf/dashboard/home'],
    ['GET', '/bookshelf/dashboard/pdfs'],
    ['GET', '/bookshelf/dashboard/upload'],
    /* the guard runs before multer, so an empty body never reaches an upload */
    ['POST', '/bookshelf/dashboard/uploads']
];

const ADMIN_ROUTES = [
    ['GET', '/bookshelf/dashboard/users'],
    ['GET', '/bookshelf/dashboard/utils'],
    ['GET', '/bookshelf/dashboard/users/2/row'],
    ['DELETE', '/bookshelf/dashboard/pdfs/11111111-2222-3333-4444-555555555555'],
    ['POST', '/bookshelf/dashboard/utils/resync']
];

test('anonymous callers are sent to sign in, never served', async () => {

    for (const [method, path] of [...DASHBOARD_ROUTES, ...ADMIN_ROUTES, ['GET', '/bookshelf/viewer']]) {

        const response = await call(method, path, null);

        if (method === 'GET') {
            assert.equal(response.status, 302, `${method} ${path}`);
            assert.match(response.headers.get('location'), /\/bookshelf\/login/, `${method} ${path}`);
        } else {
            /* a non-GET cannot be answered with a login page */
            assert.equal(response.status, 401, `${method} ${path}`);
        }
    }
});

test('an htmx request without a session gets a redirect header, not a login page in a fragment', async () => {

    const response = await call('GET', '/bookshelf/dashboard/pdfs', null, {htmx: true});

    assert.equal(response.status, 401);
    assert.match(response.headers.get('hx-redirect'), /\/bookshelf\/login/);
});

test('a viewer session cannot reach the dashboard', async () => {

    /*
     * signed in through SSO, but no tbl_users row - the app's largest
     * population, and the one a broken gate would expose the dashboard to
     */
    for (const [method, path] of [...DASHBOARD_ROUTES, ...ADMIN_ROUTES]) {
        const response = await call(method, path, VIEWER);
        assert.equal(response.status, 403, `${method} ${path}`);
    }
});

test('a viewer session can reach the viewer routes', async () => {

    const response = await call('GET', '/bookshelf/viewer?pdf=' + PDF_ROW.uuid, VIEWER);
    assert.equal(response.status, 200);
});

test('staff reach the staff dashboard', async () => {

    for (const [method, path] of DASHBOARD_ROUTES) {
        const response = await call(method, path, STAFF);
        assert.equal(response.status, 200, `${method} ${path}`);
    }
});

test('the upload route answers staff with its result fragment, not a refusal', async () => {

    /*
     * no files attached, so this exercises the guard and the empty-selection
     * branch rather than a real upload
     */
    const response = await call('POST', '/bookshelf/dashboard/uploads', STAFF);

    assert.equal(response.status, 200);
    assert.match(await response.text(), /Choose at least one PDF/);
});

test('staff are refused every admin-only route', async () => {

    for (const [method, path] of ADMIN_ROUTES) {
        const response = await call(method, path, STAFF);
        assert.equal(response.status, 403, `${method} ${path}`);
    }
});

test('an admin reaches both tiers', async () => {

    for (const [method, path] of [...DASHBOARD_ROUTES, ...ADMIN_ROUTES]) {
        const response = await call(method, path, ADMIN);
        assert.notEqual(response.status, 401, `${method} ${path}`);
        assert.notEqual(response.status, 403, `${method} ${path}`);
    }
});

test('an htmx refusal carries headers and no body, never a full page', async () => {

    /*
     * the regression: this rendered the full-page error template, and the
     * client forced it into the target - a whole document inside a <tr>
     */
    for (const [method, path] of ADMIN_ROUTES) {

        const response = await call(method, path, STAFF, {htmx: true});
        const body = await response.text();

        assert.equal(response.status, 403, `${method} ${path}`);
        assert.equal(body, '', `${method} ${path} should send no body`);
        assert.equal(response.headers.get('hx-reswap'), 'none', `${method} ${path}`);

        const trigger = JSON.parse(response.headers.get('hx-trigger'));
        assert.match(trigger['bookshelf:denied'].message, /permission|access/i, `${method} ${path}`);
    }
});

test('a browser navigation to a refused route still gets the full error page', async () => {

    /* the htmx shape must not cost a plain browser its readable page */
    const response = await call('GET', '/bookshelf/dashboard/users', STAFF);
    const body = await response.text();

    assert.equal(response.status, 403);
    assert.match(body, /<!doctype html>/i);
    assert.match(body, /do not have permission/i);
    assert.equal(response.headers.get('hx-reswap'), null);
});

test('a non-browser caller is refused as json, not as a page', async () => {

    const response = await fetch(base + '/bookshelf/dashboard/users', {
        headers: {accept: 'application/json', cookie: session(STAFF)},
        redirect: 'manual'
    });

    assert.equal(response.status, 403);
    assert.equal((await response.json()).message, 'You do not have permission to perform this action.');
});

test('a deactivated user loses access immediately, without waiting for the token to expire', async () => {

    /*
     * the token stays valid; the tbl_users row is what decides, and it is
     * re-read on every request
     */
    const before_status = (await call('GET', '/bookshelf/dashboard/home', STAFF)).status;
    assert.equal(before_status, 200);

    const row = ROWS[STAFF];
    delete ROWS[STAFF];

    try {
        const response = await call('GET', '/bookshelf/dashboard/home', STAFF);
        assert.equal(response.status, 403);
    } finally {
        ROWS[STAFF] = row;
    }
});

test('a tampered or unsigned token is refused', async () => {

    const good = JWT.sign({sub: ADMIN, tier: 'viewer'});

    const rejected = [
        good.slice(0, -2) + 'xx',
        'not-a-token',
        /* signed with the right shape but a different secret */
        require('jsonwebtoken').sign({sub: ADMIN}, 'wrong-secret', {algorithm: 'HS512', issuer: 'rbac-test'})
    ];

    for (const token of rejected) {
        const response = await fetch(base + '/bookshelf/dashboard/home', {
            headers: {accept: 'text/html', cookie: `bookshelf_session=${token}`},
            redirect: 'manual'
        });
        assert.equal(response.status, 302, `token: ${token.slice(0, 24)}`);
    }
});
