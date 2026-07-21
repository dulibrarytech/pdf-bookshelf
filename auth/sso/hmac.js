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
 * HMAC-SHA256 signature verification for the SSO callback (shared DU IT
 * spec - same wiring as repo-backend-v2).
 *
 * The upstream identity proxy computes:
 *     signature = hex( HMAC-SHA256(employeeID + '|' + timestamp + '|' + nonce, secret) )
 * and includes it in the POST body. We recompute locally and compare via
 * constant-time equality.
 *
 * Two-secret rollover: if SSO_HMAC_SECRET_NEXT is also configured, either
 * secret produces a valid signature - set the new secret as "next", deploy,
 * then promote it once upstream is signing with it.
 */

const { createHmac, timingSafeEqual } = require('node:crypto');
const { UnauthorizedError, ValidationError } = require('../../libs/errors');

const ALGO = 'sha256';
/* SHA-256 hex digest = 64 chars */
const EXPECTED_HEX_LEN = 64;

/**
 * Computes the canonical signature for a payload
 * @param employee_id
 * @param timestamp
 * @param nonce
 * @param secret
 * @returns {string} hex-encoded signature
 */
exports.sign = function (employee_id, timestamp, nonce, secret) {

    if (!secret) {
        throw new Error('hmac.sign: secret is required');
    }

    const message = `${employee_id}|${timestamp}|${nonce}`;
    return createHmac(ALGO, secret).update(message).digest('hex');
};

/**
 * Verifies a signature against one or more candidate secrets.
 * Returns true on success, throws on any failure.
 * @param body the POST body
 * @param secrets non-empty list of secrets to try
 */
exports.verify = function (body, secrets) {

    if (!Array.isArray(secrets) || secrets.length === 0) {
        throw new Error('hmac.verify: at least one secret is required');
    }

    if (!body ||
        typeof body.signature !== 'string' ||
        body.signature.length !== EXPECTED_HEX_LEN ||
        !/^[0-9a-f]+$/i.test(body.signature)) {
        throw new ValidationError('Missing or malformed signature');
    }

    if (body.employeeID === undefined || body.timestamp === undefined || body.nonce === undefined) {
        throw new ValidationError('Cannot verify signature without employeeID, timestamp, nonce');
    }

    const provided = Buffer.from(body.signature.toLowerCase(), 'hex');

    if (provided.length !== 32) {
        throw new ValidationError('Signature is not a 256-bit digest');
    }

    for (const secret of secrets) {

        if (!secret) {
            continue;
        }

        const expected = Buffer.from(
            exports.sign(String(body.employeeID), String(body.timestamp), String(body.nonce), secret),
            'hex'
        );

        if (provided.length === expected.length && timingSafeEqual(provided, expected)) {
            return true;
        }
    }

    throw new UnauthorizedError('Invalid signature');
};
