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

module.exports = Object.freeze({
    app_name: process.env.APP_NAME || 'PDF Bookshelf @ DU',
    /*
     * startup timestamp appended to static asset URLs (?v=) so browsers pick
     * up fresh CSS/JS after every deploy/restart without a hard reload
     */
    asset_v: Date.now().toString(36),
    app_version: process.env.APP_VERSION || 'v2.0.0',
    organization: process.env.ORGANIZATION || 'University of Denver Libraries',
    app_host: process.env.APP_HOST || 'localhost',
    app_port: process.env.APP_PORT || 8005,
    app_path: process.env.APP_PATH || '/bookshelf',
    host: process.env.HOST || 'http://localhost:8005',
    token_secret: process.env.TOKEN_SECRET,
    token_algo: process.env.TOKEN_ALGO || 'HS512',
    token_expires: process.env.TOKEN_EXPIRES || '12h',
    token_issuer: process.env.TOKEN_ISSUER,
    sso_url: process.env.SSO_URL,
    sso_response_url: process.env.SSO_RESPONSE_URL,
    sso_logout_url: process.env.SSO_LOGOUT_URL,
    /* legacy HTTP_HOST string match - defense-in-depth only, never the sole check */
    sso_host: process.env.SSO_HOST,
    sso_require_hmac: process.env.SSO_REQUIRE_HMAC === '1',
    sso_require_freshness: process.env.SSO_REQUIRE_FRESHNESS === '1',
    sso_max_skew_seconds: parseInt(process.env.SSO_MAX_SKEW_SECONDS, 10) || 300,
    sso_hmac_secret: process.env.SSO_HMAC_SECRET,
    sso_hmac_secret_next: process.env.SSO_HMAC_SECRET_NEXT,
    db_host: process.env.DB_HOST || '127.0.0.1',
    db_port: process.env.DB_PORT || 3306,
    db_user: process.env.DB_USER,
    db_password: process.env.DB_PASSWORD,
    db_name: process.env.DB_NAME || 'pdf_bookshelf',
    storage_path: process.env.STORAGE_PATH || './storage'
});
