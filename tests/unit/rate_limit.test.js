'use strict';

/*
 * The limiter counts per client address inside a fixed window, and answers a
 * refusal in the caller's shape (libs/refuse.js): JSON for an API caller,
 * headers and no body for htmx, the error page - with a way forward when the
 * route supplies one - for a browser. It used to be JSON for everyone, which
 * put a bare {"message":...} on screen as the whole page after a student had
 * already signed in at the identity provider.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const RATE_LIMIT = require('../../libs/rate_limit');

/**
 * @param overrides {ip, htmx: true, accepts: 'html'|'json', query}
 */
function request(overrides = {}) {

    return {
        ip: overrides.ip || '1.2.3.4',
        query: overrides.query || {},
        get: (name) => (overrides.htmx === true && name === 'hx-request') ? 'true' : undefined,
        accepts: () => overrides.accepts || 'json'
    };
}

function response() {

    const res = {status_code: null, headers: {}, body: undefined, rendered: null, ended: false};

    res.status = (code) => { res.status_code = code; return res; };
    res.set = (name, value) => { res.headers[name.toLowerCase()] = value; return res; };
    res.send = (body) => { res.body = body; return res; };
    res.end = () => { res.ended = true; return res; };
    res.render = (view, locals) => { res.rendered = {view: view, locals: locals}; return res; };

    return res;
}

function run(middleware, req) {

    const res = response();
    let passed = false;

    middleware(req, res, () => { passed = true; });
    return {passed, res};
}

test('allows up to max requests then answers 429', () => {

    const middleware = RATE_LIMIT({window_ms: 60000, max: 3});

    for (let i = 0; i < 3; i++) {
        assert.equal(run(middleware, request()).passed, true);
    }

    const blocked = run(middleware, request());
    assert.equal(blocked.passed, false);
    assert.equal(blocked.res.status_code, 429);
});

test('tracks clients separately by ip', () => {

    const middleware = RATE_LIMIT({window_ms: 60000, max: 1});

    assert.equal(run(middleware, request({ip: '1.1.1.1'})).passed, true);
    assert.equal(run(middleware, request({ip: '2.2.2.2'})).passed, true);
    assert.equal(run(middleware, request({ip: '1.1.1.1'})).passed, false);
});

test('a refusal says when the window resets', () => {

    const middleware = RATE_LIMIT({window_ms: 60000, max: 0.5});
    const { res } = run(middleware, request());

    /* whole seconds, at least 1 - a 0 would tell a client to retry at once */
    const retry_after = Number(res.headers['retry-after']);
    assert.ok(Number.isInteger(retry_after) && retry_after >= 1 && retry_after <= 60, `Retry-After ${res.headers['retry-after']}`);
});

test('an API caller is refused as JSON', () => {

    const middleware = RATE_LIMIT({window_ms: 60000, max: 0.5, message: 'Slow down.'});
    const { res } = run(middleware, request({accepts: 'json'}));

    assert.equal(res.status_code, 429);
    assert.deepEqual(res.body, {message: 'Slow down.'});
    assert.equal(res.rendered, null);
});

test('an htmx caller is refused with headers and no body, so nothing lands in its target', () => {

    const middleware = RATE_LIMIT({window_ms: 60000, max: 0.5, message: 'Slow down.'});
    const { res } = run(middleware, request({htmx: true}));

    assert.equal(res.status_code, 429);
    assert.equal(res.ended, true);
    assert.equal(res.body, undefined);
    assert.equal(res.rendered, null);
    assert.equal(res.headers['hx-reswap'], 'none');
    assert.deepEqual(JSON.parse(res.headers['hx-trigger']), {'bookshelf:denied': {message: 'Slow down.', status: 429}});
});

test('a browser is refused with the error page, not JSON', () => {

    /*
     * the regression: the sign-in callback is a top-level browser POST, so a
     * JSON refusal became the whole page
     */
    const middleware = RATE_LIMIT({window_ms: 60000, max: 0.5, message: 'Slow down.'});
    const { res } = run(middleware, request({accepts: 'html'}));

    assert.equal(res.status_code, 429);
    assert.equal(res.rendered.view, 'error');
    assert.equal(res.rendered.locals.message, 'Slow down.');
    assert.equal(res.rendered.locals.retry, undefined);
});

test('the error page offers the way forward the route supplies', () => {

    const middleware = RATE_LIMIT({
        window_ms: 60000,
        max: 0.5,
        retry: (req) => '/login?next=' + encodeURIComponent(req.query.next)
    });
    const { res } = run(middleware, request({accepts: 'html', query: {next: '/viewer?pdf=abc'}}));

    assert.deepEqual(res.rendered.locals.retry, {href: '/login?next=%2Fviewer%3Fpdf%3Dabc', label: 'Try again'});
});
