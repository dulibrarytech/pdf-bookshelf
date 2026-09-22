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
/* low enough to hit from a test; the default is sized for a room signing in at once */
process.env.SSO_RATE_LIMIT_PER_MINUTE = '3';
/* /login needs somewhere to send people; nothing here ever follows the redirect */
process.env.SSO_URL = 'https://sso.example.edu/login';
process.env.SSO_RESPONSE_URL = 'http://app.example.edu/bookshelf/sso';

const { test, before, after, mock } = require('node:test');
const assert = require('node:assert/strict');
const HTTP = require('node:http');

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
    mock.method(PDFS_MODEL, 'reactivate', async () => 1);
    mock.method(PDFS_MODEL, 'increment_hits', () => undefined);
    mock.method(DASHBOARD_MODEL, 'get_stats', async () => ({total_pdfs: 0, most_accessed_file: 'none', total_hits: 0}));
    mock.method(USERS_MODEL, 'list', async () => []);
    mock.method(USERS_MODEL, 'get', async () => ROWS[STAFF]);
    mock.method(USERS_MODEL, 'update', async (id) => {

        /* a refusal whose text carries markup - see the error-fragment test */
        if (String(id) === '666') {
            const error = new Error('<img src=x onerror=alert(1)> is not a name.');
            error.status = 400;
            throw error;
        }

        return ROWS[STAFF];
    });
    mock.method(USERS_MODEL, 'create', async () => {
        const error = new Error('<script>alert(1)</script> already exists.');
        error.status = 409;
        throw error;
    });
    mock.method(USERS_MODEL, 'set_active', async () => ROWS[STAFF]);
    /* a finished run, so both the start and the status route render */
    const FINISHED_RESYNC = {
        started_by: 3, started_at: 1000, finished_at: 1500, scanned: 0, progress: {done: 0, total: 0},
        report: {scanned: 0, added: [], updated: [], missing: [], skipped: [], failed: []}, error: null
    };
    mock.method(UTILS_MODEL, 'start', () => ({job: FINISHED_RESYNC, joined: false}));
    mock.method(UTILS_MODEL, 'status', () => FINISHED_RESYNC);

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
 * A raw HTTP client, so a test controls every header it sends. Node's fetch()
 * stamps Sec-Fetch-Mode: cors on every request and ignores an override,
 * which makes it look like a page's own fetch - and the guards answer those
 * with a plain 401 rather than the sign-in redirect a navigation gets.
 * Returns the parts of a fetch Response the tests use.
 */
function request(method, path, headers = {}, body) {

    return new Promise(function (resolve, reject) {

        const req = HTTP.request(base + path, {method: method, headers: headers}, function (res) {

            const chunks = [];

            res.on('data', (chunk) => chunks.push(chunk));
            res.on('end', function () {

                const text = Buffer.concat(chunks).toString('utf8');

                resolve({
                    status: res.statusCode,
                    headers: {
                        get: function (name) {
                            const value = res.headers[name.toLowerCase()];
                            return value === undefined ? null : (Array.isArray(value) ? value.join(', ') : value);
                        }
                    },
                    text: async () => text,
                    json: async () => JSON.parse(text)
                });
            });
        });

        req.on('error', reject);

        if (body !== undefined) {
            req.write(body);
        }

        req.end();
    });
}

/**
 * A browser navigation: what a person clicking a link sends.
 * @param who a du_id, or null for an anonymous caller
 * @param options {htmx: true} to send the header htmx sets on its requests
 */
function call(method, path, who, options = {}) {

    const headers = {accept: 'text/html', 'sec-fetch-mode': 'navigate'};

    if (who !== null) {
        headers.cookie = session(who);
    }

    if (options.htmx === true) {
        headers['hx-request'] = 'true';
    }

    return request(method, path, headers);
}

/* ---------------------------------------------------------------- 1. inventory */

/*
 * Every route the app registers, and what must guard it. Public entries are
 * listed explicitly with '' so that opening a new route to the world is a
 * deliberate edit here, not an omission somewhere else.
 */
const EXPECTED = {
    /* the bare hostname - a redirect into sign-in, nothing served */
    'GET /': '',
    'GET /bookshelf/login': '',
    'POST /bookshelf/sso': '',
    'GET /bookshelf/signed-in': '',
    'GET /bookshelf/logout': '',
    'POST /bookshelf/logout': '',
    'GET /bookshelf/': '',
    'GET /bookshelf/healthcheck': '',
    'GET /robots.txt': '',
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
    'POST /bookshelf/dashboard/pdfs/:uuid/restore': 'dashboard:admin',
    'GET /bookshelf/dashboard/users': 'dashboard:admin',
    'POST /bookshelf/dashboard/users': 'dashboard:admin',
    'GET /bookshelf/dashboard/users/:id/row': 'dashboard:admin',
    'GET /bookshelf/dashboard/users/:id/edit': 'dashboard:admin',
    'PUT /bookshelf/dashboard/users/:id': 'dashboard:admin',
    'DELETE /bookshelf/dashboard/users/:id': 'dashboard:admin',
    'POST /bookshelf/dashboard/users/:id/reactivate': 'dashboard:admin',
    'GET /bookshelf/dashboard/utils': 'dashboard:admin',
    'POST /bookshelf/dashboard/utils/resync': 'dashboard:admin',
    'GET /bookshelf/dashboard/utils/resync/status': 'dashboard:admin'
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
    ['POST', '/bookshelf/dashboard/pdfs/11111111-2222-3333-4444-555555555555/restore'],
    ['POST', '/bookshelf/dashboard/utils/resync'],
    ['GET', '/bookshelf/dashboard/utils/resync/status']
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

test('the bare hostname and the app root send you into sign-in, not a 404 or a version', async () => {

    /*
     * /login then routes by tier, which is why both go there and not
     * straight to the dashboard - a viewer would only be 403'd there.
     * /bookshelf used to answer a JSON line naming the app and its version
     * to anyone who asked (L10); a session makes no difference to the bounce.
     */
    for (const path of ['/', '/bookshelf', '/bookshelf/']) {
        for (const who of [null, ADMIN]) {
            const response = await call('GET', path, who);
            const label = `${path} as ${who === null ? 'nobody' : 'admin'}`;
            assert.equal(response.status, 302, label);
            assert.equal(response.headers.get('location'), '/bookshelf/login', label);
            assert.doesNotMatch(await response.text(), /info|University|Bookshelf @/, `${label} must not name the app or its version`);
        }
    }
});

/* ---------------------------------------- state changes come from our page */

test('a dashboard action from another site is refused, whatever session it carries', async () => {

    /*
     * the second lock beside SameSite=Lax: even with the cookie, a form or
     * script on someone else's page cannot change anything here
     */
    const body = 'email=a@du.edu&first_name=A&last_name=B&role=staff';
    const form = {cookie: session(ADMIN), 'content-type': 'application/x-www-form-urlencoded'};

    const foreign = await request('PUT', '/bookshelf/dashboard/users/2', {...form, 'sec-fetch-site': 'cross-site', 'hx-request': 'true'}, body);
    assert.equal(foreign.status, 403);
    assert.equal(await foreign.text(), '');
    assert.match(JSON.parse(foreign.headers.get('hx-trigger'))['bookshelf:denied'].message, /did not come from the PDF Bookshelf page/);

    /* an older browser, foreign Origin only; and a sibling DU site */
    assert.equal((await request('PUT', '/bookshelf/dashboard/users/2', {...form, origin: 'https://evil.example'}, body)).status, 403);
    assert.equal((await request('POST', '/bookshelf/dashboard/utils/resync', {...form, 'sec-fetch-site': 'same-site'})).status, 403);

    /* an upload from elsewhere is refused before a byte of it is parsed */
    assert.equal((await request('POST', '/bookshelf/dashboard/uploads', {...form, 'sec-fetch-site': 'cross-site'})).status, 403);

    /* our own page - modern, and older with a matching Origin */
    const ours = await request('PUT', '/bookshelf/dashboard/users/2', {...form, 'sec-fetch-site': 'same-origin', 'hx-request': 'true'}, body);
    assert.equal(ours.status, 200);
    const older = await request('PUT', '/bookshelf/dashboard/users/2', {...form, origin: 'http://' + new URL(base).host}, body);
    assert.equal(older.status, 200);

    /* reads are not state changes */
    assert.equal((await request('GET', '/bookshelf/dashboard/users', {cookie: session(ADMIN), accept: 'text/html', 'sec-fetch-site': 'cross-site'})).status, 200);
});

/* ----------------------------------------------------------------- sign-out */

const CLEARS_SESSION = /bookshelf_session=;/;

test('signing out is a same-origin POST; a GET, or a form on another site, changes nothing', async () => {

    /*
     * the regression: GET /logout cleared the session, and SameSite=Lax
     * cookies ride along on a top-level navigation - so a link on anyone's
     * page signed people out
     */
    const typed = await call('GET', '/bookshelf/logout', STAFF);
    assert.equal(typed.status, 200);
    assert.equal(typed.headers.get('set-cookie'), null, 'a GET must not touch the session');
    assert.match(await typed.text(), /method="post" action="\/bookshelf\/logout"/);

    /* a cross-site form: the same confirmation page, session untouched */
    const foreign = await request('POST', '/bookshelf/logout', {cookie: session(STAFF), 'sec-fetch-site': 'cross-site', origin: 'https://evil.example'});
    assert.equal(foreign.status, 200);
    assert.equal(foreign.headers.get('set-cookie'), null);
    assert.match(await foreign.text(), /Sign out of/);

    /* an older browser without Sec-Fetch-Site, from another origin */
    const older_foreign = await request('POST', '/bookshelf/logout', {cookie: session(STAFF), origin: 'https://evil.example'});
    assert.equal(older_foreign.headers.get('set-cookie'), null);

    /* our own form */
    const ours = await request('POST', '/bookshelf/logout', {cookie: session(STAFF), 'sec-fetch-site': 'same-origin'});
    assert.equal(ours.status, 200);
    assert.match(ours.headers.get('set-cookie'), CLEARS_SESSION);
    /* both the APP_PATH cookie and the legacy root one go (L4) */
    assert.match(ours.headers.get('set-cookie'), /Path=\/bookshelf/);
    assert.match(ours.headers.get('set-cookie'), /Path=\/[;,]/);

    /* an older browser whose Origin matches the host it reached */
    const older_ours = await request('POST', '/bookshelf/logout', {cookie: session(STAFF), origin: 'http://' + new URL(base).host, host: new URL(base).host});
    assert.match(older_ours.headers.get('set-cookie'), CLEARS_SESSION);
});

/* ---------------------------------------------------------------- crawlers */

test('robots.txt is at the domain root, where a crawler reads it, and every answer says noindex', async () => {

    const robots = await request('GET', '/robots.txt');
    assert.equal(robots.status, 200);
    assert.match(robots.headers.get('content-type'), /^text\/plain/);
    assert.equal(await robots.text(), 'User-agent: *\nDisallow: /');

    /* the old location was never read by anything */
    assert.equal((await call('GET', '/bookshelf/robots.txt', null)).status, 404);

    for (const path of ['/', '/bookshelf/healthcheck', '/bookshelf/static/assets/styles.css', '/bookshelf/nope']) {
        const response = await request('GET', path, {accept: 'text/html'});
        assert.equal(response.headers.get('x-robots-tag'), 'noindex, nofollow', path);
    }
});

/* ------------------------------------------------- the central error handler */

test('a route that does not exist is refused in the caller\'s shape', async () => {

    const page = await call('GET', '/bookshelf/nope', null);
    assert.equal(page.status, 404);
    assert.match(await page.text(), /<!doctype html>[\s\S]*Resource not found\./i);

    /* an htmx action against a route that has gone: a toast, not a page inside a row */
    const fragment = await request('GET', '/bookshelf/nope', {'hx-request': 'true', accept: 'text/html'});
    assert.equal(fragment.status, 404);
    assert.equal(await fragment.text(), '');
    assert.equal(fragment.headers.get('hx-reswap'), 'none');
    assert.equal(JSON.parse(fragment.headers.get('hx-trigger'))['bookshelf:denied'].message, 'Resource not found.');

    const api = await request('GET', '/bookshelf/nope', {accept: 'application/json'});
    assert.equal(api.status, 404);
    assert.equal((await api.json()).message, 'Resource not found.');
});

test('a parser error keeps its status and shape instead of becoming a 500 page', async () => {

    /*
     * the regression: the central handler rendered a 500 page for
     * everything, including Express's own 413 and 400
     */
    const oversized = JSON.stringify({pad: 'x'.repeat(1100 * 1024)});
    const json_headers = {'content-type': 'application/json'};

    const too_large = await request('POST', '/bookshelf/dashboard/users', {...json_headers, accept: 'application/json'}, oversized);
    assert.equal(too_large.status, 413);
    assert.equal((await too_large.json()).message, 'request entity too large');

    const too_large_page = await request('POST', '/bookshelf/dashboard/users', {...json_headers, accept: 'text/html'}, oversized);
    assert.equal(too_large_page.status, 413);
    assert.match(await too_large_page.text(), /<!doctype html>[\s\S]*request entity too large/i);

    const too_large_htmx = await request('POST', '/bookshelf/dashboard/users', {...json_headers, 'hx-request': 'true'}, oversized);
    assert.equal(too_large_htmx.status, 413);
    assert.equal(await too_large_htmx.text(), '');
    assert.equal(too_large_htmx.headers.get('hx-reswap'), 'none');

    const malformed = await request('POST', '/bookshelf/dashboard/users', {...json_headers, accept: 'application/json'}, '{not json');
    assert.equal(malformed.status, 400);
    assert.match((await malformed.json()).message, /JSON/);
});

/* --------------------------------------------------------- error fragments */

test('a model refusal reaches the screen escaped, whatever its text contains', async () => {

    /*
     * users/controller used to interpolate error.message into markup - safe
     * only while every message was a static string. The stubs above raise
     * refusals whose text is markup; it must arrive as text.
     */
    const form = {
        accept: 'text/html',
        'hx-request': 'true',
        cookie: session(ADMIN),
        'content-type': 'application/x-www-form-urlencoded'
    };

    const edit = await fetch(base + '/bookshelf/dashboard/users/666', {
        method: 'PUT', headers: form, body: 'email=a@du.edu&first_name=A&last_name=B&role=staff'
    });
    const row = await edit.text();

    assert.equal(edit.status, 400);
    assert.match(row, /<tr><td colspan="6" class="text-danger">/);
    assert.doesNotMatch(row, /<img/);
    assert.match(row, /&lt;img src=x onerror=alert\(1\)&gt; is not a name\./);

    const add = await fetch(base + '/bookshelf/dashboard/users', {
        method: 'POST', headers: form, body: 'du_id=1&email=a@du.edu&first_name=A&last_name=B&role=staff'
    });
    const alert = await add.text();

    assert.equal(add.status, 409);
    assert.match(alert, /class="alert alert-danger/);
    assert.doesNotMatch(alert, /<script>/);
    assert.match(alert, /&lt;script&gt;alert\(1\)&lt;\/script&gt; already exists\./);
});

/* ------------------------------------------------------ sign-in rate limit */

function sso_callback(headers, query = '') {

    return fetch(base + '/bookshelf/sso' + query, {
        method: 'POST',
        headers: Object.assign({'content-type': 'application/x-www-form-urlencoded'}, headers),
        body: 'employeeID=' + VIEWER,
        redirect: 'manual'
    });
}

test('a refused sign-in is a page with a way forward, never bare JSON', async () => {

    /* the three this file allows per minute (env at the top) are spent first */
    for (let i = 0; i < 3; i++) {
        assert.equal((await sso_callback({accept: 'text/html'})).status, 303, `callback ${i + 1} should sign in`);
    }

    /*
     * the regression: the callback is a top-level browser POST, so a JSON
     * refusal was the whole page - after the student had already signed in
     * at the identity provider
     */
    const limited = await sso_callback({accept: 'text/html'}, '?next=%2Fbookshelf%2Fviewer%3Fpdf%3Dabc');
    const body = await limited.text();

    assert.equal(limited.status, 429);
    assert.match(limited.headers.get('retry-after'), /^\d+$/);
    assert.match(body, /<!doctype html>/i);
    assert.match(body, /Sign-in is busy right now/);
    /* and the way forward keeps the page they were heading for */
    assert.match(body, /href="\/bookshelf\/login\?next=%2Fbookshelf%2Fviewer%3Fpdf%3Dabc"/);

    const htmx = await sso_callback({accept: 'text/html', 'hx-request': 'true'});
    assert.equal(htmx.status, 429);
    assert.equal(await htmx.text(), '');
    assert.equal(htmx.headers.get('hx-reswap'), 'none');
    assert.equal(JSON.parse(htmx.headers.get('hx-trigger'))['bookshelf:denied'].status, 429);

    const json = await sso_callback({accept: 'application/json'});
    assert.equal(json.status, 429);
    assert.match((await json.json()).message, /busy right now/);
});

test('/login sends no default target, so a viewer is not routed to a 403 after signing in', async () => {

    /* the root redirect lands here; the callback then routes by tier */
    const response = await call('GET', '/bookshelf/login', null);
    assert.equal(response.status, 302);

    const app_url = new URL(new URL(response.headers.get('location')).searchParams.get('app_url'));
    assert.equal(app_url.searchParams.has('next'), false);
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

test('a page\'s own fetch without a session gets a plain 401, never a redirect it cannot follow', async () => {

    /*
     * the viewer's document fetch after its session expired: the sign-in
     * redirect ends at the identity provider, another origin, so a fetch
     * following it died as a CORS failure and pdf.js showed a generic error
     */
    const fetched = await request('GET', '/bookshelf/pdf/' + PDF_ROW.uuid, {'sec-fetch-mode': 'cors', accept: '*/*'});
    assert.equal(fetched.status, 401);
    assert.equal((await fetched.json()).message, 'Unauthorized');

    /* a client without the Sec-Fetch header that did not ask for HTML by name is not a navigation either */
    const legacy = await request('GET', '/bookshelf/pdf/' + PDF_ROW.uuid, {accept: '*/*'});
    assert.equal(legacy.status, 401);

    /* the viewer's session probe is a HEAD - answered, never redirected, never counted */
    const before = PDFS_MODEL.increment_hits.mock.callCount();
    const probe = await request('HEAD', '/bookshelf/pdf/' + PDF_ROW.uuid, {'sec-fetch-mode': 'cors'});
    assert.equal(probe.status, 401);
    const signed_in_probe = await request('HEAD', '/bookshelf/pdf/' + PDF_ROW.uuid, {'sec-fetch-mode': 'cors', cookie: session(VIEWER)});
    assert.notEqual(signed_in_probe.status, 401);
    assert.equal(PDFS_MODEL.increment_hits.mock.callCount(), before, 'a HEAD must not count as a view');
});

test('a browser navigation without a session is still sent to sign in, whatever it accepts', async () => {

    /* Sec-Fetch-Mode decides when present; Accept only when it is absent */
    const modern = await request('GET', '/bookshelf/viewer?pdf=' + PDF_ROW.uuid, {'sec-fetch-mode': 'navigate', accept: '*/*'});
    assert.equal(modern.status, 302);
    assert.match(modern.headers.get('location'), /\/bookshelf\/login\?next=/);

    const older = await request('GET', '/bookshelf/viewer?pdf=' + PDF_ROW.uuid, {accept: 'text/html,application/xhtml+xml,*/*;q=0.8'});
    assert.equal(older.status, 302);
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

    /*
     * not just "not refused": with every model stubbed, each of these must
     * render, so a 500 here is a broken handler or template, not a guard
     */
    for (const [method, path] of [...DASHBOARD_ROUTES, ...ADMIN_ROUTES]) {
        const response = await call(method, path, ADMIN);
        assert.ok(response.status < 400, `${method} ${path} answered ${response.status}`);
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
        const response = await request('GET', '/bookshelf/dashboard/home', {
            accept: 'text/html', 'sec-fetch-mode': 'navigate', cookie: `bookshelf_session=${token}`
        });
        assert.equal(response.status, 302, `token: ${token.slice(0, 24)}`);
    }
});
