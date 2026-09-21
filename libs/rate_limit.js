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
 *
 * Keyed by req.ip, which is only as right as the app's trust-proxy setting
 * (config/express.js): trust the wrong hop and every user behind nginx shares
 * one bucket. And DU users share addresses anyway - campus NAT and the VPN put
 * a whole class behind one - so a ceiling has to be sized for a room signing
 * in at once, not for one person. This is abuse throttling, not a security
 * control.
 *
 * A refusal answers in the caller's shape (libs/refuse.js): an htmx action
 * gets headers and a toast, a browser gets the error page - with a way
 * forward when the caller supplies one - and anything else gets JSON. It used
 * to be JSON for everyone, which put a bare {"message":...} on screen as the
 * whole page after a student had already signed in at the identity provider.
 */

const { refuse } = require('./refuse');

/**
 * Builds a rate-limiting middleware
 * @param options {window_ms, max, message, retry} - retry is an optional
 *   (req) => href, offered on the full-page refusal as "Try again"
 */
module.exports = function (options = {}) {

    const window_ms = options.window_ms || 60000;
    const max = options.max || 30;
    const message = options.message || 'Too many requests. Try again shortly.';
    const retry = typeof options.retry === 'function' ? options.retry : null;

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

            /* seconds until this window resets - never 0, or a client would retry at once */
            res.set('Retry-After', String(Math.max(1, Math.ceil((window_start + window_ms - now) / 1000))));
            refuse(req, res, 429, message, retry === null ? undefined : {href: retry(req), label: 'Try again'});
            return;
        }

        next();
    };
};
