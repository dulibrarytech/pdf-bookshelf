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
 * Typed error classes, and the mapping the central handler applies.
 *
 * A controller answers its own refusals - a 400 row, a 409 alert - in the
 * shape its caller expects, and these classes carry the status and code it
 * needs to do that. Whatever escapes to the central handler in
 * config/express.js is mapped by describe_error(): one of these keeps its
 * status and message; a client error from Express's own parsers (a body
 * over the limit, malformed JSON) keeps its status, and its message when the
 * parser marked it as meant to be shown; anything else is a 500 with a
 * generic line - the real message goes to the log, never to the screen.
 */

const HTTP = require('node:http');

class AppError extends Error {

    constructor(message, status = 500, code = 'INTERNAL_ERROR') {
        super(message);
        this.name = this.constructor.name;
        this.status = status;
        this.code = code;
        Error.captureStackTrace(this, this.constructor);
    }
}

class ValidationError extends AppError {

    constructor(message = 'Bad request') {
        super(message, 400, 'VALIDATION_ERROR');
    }
}

class UnauthorizedError extends AppError {

    constructor(message = 'Unauthorized') {
        super(message, 401, 'UNAUTHORIZED');
    }
}

class ForbiddenError extends AppError {

    constructor(message = 'Forbidden') {
        super(message, 403, 'FORBIDDEN');
    }
}

class NotFoundError extends AppError {

    constructor(message = 'Resource not found') {
        super(message, 404, 'NOT_FOUND');
    }
}

class ConflictError extends AppError {

    constructor(message = 'Conflict') {
        super(message, 409, 'CONFLICT');
    }
}

/**
 * How the central handler should answer an error it was handed.
 * @param error anything thrown in a route or passed to next()
 * @returns {{status: number, message: string, expected: boolean}} expected
 *   marks a client error, worth a warning in the log rather than an error
 */
function describe_error(error) {

    const raw = error === null || typeof error !== 'object'
        ? undefined
        : (Number.isInteger(error.status) ? error.status : error.statusCode);
    const status = Number.isInteger(raw) && raw >= 400 && raw <= 599 ? raw : 500;

    if (status >= 500) {
        return {status: status, message: 'An unexpected error occurred.', expected: false};
    }

    /* our own refusals, and what http-errors marks `expose` (Express's parsers do, for 4xx) */
    const shown = error instanceof AppError || error.expose === true;
    const own = shown && typeof error.message === 'string' && error.message.length > 0;

    return {status: status, message: own ? error.message : (HTTP.STATUS_CODES[status] || 'Request refused.'), expected: true};
}

module.exports = {
    AppError,
    ValidationError,
    UnauthorizedError,
    ForbiddenError,
    NotFoundError,
    ConflictError,
    describe_error
};
