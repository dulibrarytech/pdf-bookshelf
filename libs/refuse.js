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
 * Answers a refusal - 401, 403, 429, 500 - in the caller's shape. An htmx
 * request gets no body: HX-Reswap none leaves the page untouched and the
 * message rides an HX-Trigger event that app.js turns into a toast. A
 * browser navigation gets the error page, optionally with a way forward.
 * Anything else gets JSON. Shared by the auth guards and the rate limiter.
 */

/**
 * True for a request htmx made (it sets the header on every one)
 * @param req
 */
exports.is_htmx = function (req) {
    return req.get('hx-request') !== undefined;
};

/**
 * @param req
 * @param res
 * @param status
 * @param message shown to the user
 * @param retry optional {href, label} - offered on the error page only, for a
 *   refusal the user can do something about (a rate limit, not a permission)
 */
exports.refuse = function (req, res, status, message, retry) {

    if (exports.is_htmx(req)) {
        res.set('HX-Reswap', 'none');
        res.set('HX-Trigger', JSON.stringify({'bookshelf:denied': {message: message, status: status}}));
        res.status(status).end();
        return;
    }

    if (req.accepts(['html', 'json']) === 'html') {
        res.status(status).render('error', {message: message, retry: retry});
        return;
    }

    res.status(status).send({message: message});
};
