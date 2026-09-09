/**
 * Copyright 2026 University of Denver
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

'use strict';

/*
 * Minimal fixed-window in-memory rate limiter (single-instance app).
 * Applied to the auth callback and upload endpoints - v1 had no limits
 * anywhere (see the exhibits rate-limit review for the pattern).
 */

/**
 * Builds a rate-limiting middleware
 * @param options {window_ms, max, message}
 */
module.exports = function (options = {}) {

    const window_ms = options.window_ms || 60000;
    const max = options.max || 30;
    const message = options.message || 'Too many requests. Try again shortly.';

    let window_start = Date.now();
    let counts = new Map();

    return function (req, res, next) {

        const now = Date.now();

        if (now - window_start >= window_ms) {
            window_start = now;
            counts = new Map();
        }

        const key = req.ip || 'unknown';
        const count = (counts.get(key) || 0) + 1;
        counts.set(key, count);

        if (count > max) {
            res.status(429).send({message: message});
            return;
        }

        next();
    };
};
