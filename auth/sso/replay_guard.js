/**

 Copyright 2026 University of Denver

 Licensed under the Apache License, Version 2.0 (the "License");
 you may not use this file except in compliance with the License.
 You may obtain a copy of the License at

 http://www.apache.org/licenses/LICENSE-2.0

 Unless required by applicable law or agreed to in writing, software
 distributed under the License is distributed on an "AS IS" BASIS,
 WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 See the License for the specific language governing permissions and
 limitations under the License.

 */

'use strict';

/*
 * Timestamp + nonce replay guard for the SSO callback.
 *
 * Rejects callbacks whose timestamp is older than max_skew_seconds OR whose
 * nonce has already been seen inside the window. Re-using a nonce is treated
 * as a replay attempt, so a captured POST can't be played back.
 *
 * Two-part defense:
 *   - freshness  -> bounds how old a request can be
 *   - uniqueness -> catches replays inside the freshness window
 *
 * The seen-nonce store is an in-process Map pruned on each check; entries
 * expire after 2x the skew window so it can never grow past the number of
 * sign-ins inside that window (single-instance app - no Redis needed).
 */

const { UnauthorizedError, ValidationError } = require('../../libs/errors');

let seen = new Map();

function prune(now_ms, ttl_ms) {

    for (const [key, expires] of seen) {

        if (expires <= now_ms) {
            seen.delete(key);
        }
    }
}

/**
 * Checks timestamp freshness and nonce uniqueness (throws on failure)
 * @param timestamp Unix seconds (int or string)
 * @param nonce random per-request identifier
 * @param options {max_skew_seconds, now (for tests; returns ms)}
 */
exports.check = function (timestamp, nonce, options = {}) {

    const { max_skew_seconds, now = Date.now } = options;

    if (typeof max_skew_seconds !== 'number' || max_skew_seconds <= 0) {
        throw new Error('replay_guard.check: max_skew_seconds is required');
    }

    const ts = Number.parseInt(timestamp, 10);

    if (!Number.isFinite(ts) || ts <= 0) {
        throw new ValidationError('Missing or invalid timestamp');
    }

    if (typeof nonce !== 'string' || nonce.length < 8 || nonce.length > 128) {
        throw new ValidationError('Missing or invalid nonce');
    }

    const now_ms = now();
    const now_seconds = Math.floor(now_ms / 1000);
    const skew = Math.abs(now_seconds - ts);

    if (skew > max_skew_seconds) {
        throw new UnauthorizedError(`Request timestamp out of range (skew=${skew}s, max=${max_skew_seconds}s)`);
    }

    const ttl_ms = max_skew_seconds * 2 * 1000;
    prune(now_ms, ttl_ms);

    const key = `${ts}|${nonce}`;

    if (seen.has(key)) {
        throw new UnauthorizedError('Replay detected (nonce reused)');
    }

    seen.set(key, now_ms + ttl_ms);
    return true;
};

/*
 * Test-only. Drops the in-memory store so independent test cases don't
 * observe each other's nonces.
 */
exports._reset = function () {
    seen = new Map();
};
