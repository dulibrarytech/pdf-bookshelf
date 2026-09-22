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
 * Where a request came from, as the browser reports it - the check behind
 * every state change (sign-out, every dashboard action), the second lock
 * beside the session cookie's SameSite=Lax.
 *
 * Sec-Fetch-Site decides when present: same-origin and none pass. Without
 * it, Origin is compared to the host we were reached at - X-Forwarded-Host
 * when the proxy sets it, the Host header otherwise. A request with neither
 * header is not a browser page's doing and may proceed.
 */

/**
 * @param req
 * @returns {boolean} true when the request may change state
 */
exports.same_origin = function (req) {

    const site = req.get('sec-fetch-site');

    if (site !== undefined) {
        return site === 'same-origin' || site === 'none';
    }

    const origin = req.get('origin');

    if (origin === undefined) {
        return true;
    }

    try {
        return new URL(origin).host === (req.get('x-forwarded-host') || req.get('host'));
    } catch {
        return false;
    }
};
