'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const RATE_LIMIT = require('../../libs/rate_limit');

function run(middleware, ip) {

    let result = {passed: false, status: null};
    const req = {ip: ip};
    const res = {
        status(code) { result.status = code; return this; },
        send() { return this; }
    };

    middleware(req, res, () => { result.passed = true; });
    return result;
}

test('allows up to max requests then answers 429', () => {

    const middleware = RATE_LIMIT({window_ms: 60000, max: 3});

    for (let i = 0; i < 3; i++) {
        assert.equal(run(middleware, '1.2.3.4').passed, true);
    }

    const blocked = run(middleware, '1.2.3.4');
    assert.equal(blocked.passed, false);
    assert.equal(blocked.status, 429);
});

test('tracks clients separately by ip', () => {

    const middleware = RATE_LIMIT({window_ms: 60000, max: 1});

    assert.equal(run(middleware, '1.1.1.1').passed, true);
    assert.equal(run(middleware, '2.2.2.2').passed, true);
    assert.equal(run(middleware, '1.1.1.1').passed, false);
});
