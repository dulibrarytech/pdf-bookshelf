'use strict';

const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const REPLAY_GUARD = require('../../auth/sso/replay_guard');

const NOW_MS = 1784500000000;
const NOW_S = NOW_MS / 1000;
const OPTS = {max_skew_seconds: 300, now: () => NOW_MS};

beforeEach(() => REPLAY_GUARD._reset());

test('accepts a fresh timestamp and unused nonce', () => {
    assert.equal(REPLAY_GUARD.check(String(NOW_S - 10), 'nonce-000001', OPTS), true);
});

test('rejects a reused nonce (replay)', () => {
    REPLAY_GUARD.check(String(NOW_S), 'nonce-000002', OPTS);
    assert.throws(() => REPLAY_GUARD.check(String(NOW_S), 'nonce-000002', OPTS), /Replay detected/);
});

test('rejects a stale timestamp', () => {
    assert.throws(() => REPLAY_GUARD.check(String(NOW_S - 301), 'nonce-000003', OPTS), /timestamp out of range/);
});

test('rejects a future timestamp beyond skew', () => {
    assert.throws(() => REPLAY_GUARD.check(String(NOW_S + 301), 'nonce-000004', OPTS), /timestamp out of range/);
});

test('rejects malformed timestamps and nonces', () => {
    assert.throws(() => REPLAY_GUARD.check('not-a-number', 'nonce-000005', OPTS), /invalid timestamp/);
    assert.throws(() => REPLAY_GUARD.check(String(NOW_S), 'short', OPTS), /invalid nonce/);
    assert.throws(() => REPLAY_GUARD.check(String(NOW_S), 'x'.repeat(129), OPTS), /invalid nonce/);
});

test('expired nonces are pruned and reusable after the window', () => {
    REPLAY_GUARD.check(String(NOW_S), 'nonce-000006', OPTS);
    const later = {max_skew_seconds: 300, now: () => NOW_MS + 301 * 1000};
    /* same nonce, new timestamp inside the later window */
    assert.equal(REPLAY_GUARD.check(String(NOW_S + 301), 'nonce-000006', later), true);
});
