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

function is_set(value) {
    return value !== undefined && String(value).trim().length > 0;
}

/*
 * Env values are strings; Express wants a boolean for "true"/"false", a hop
 * count for a bare integer, and otherwise a comma-separated address list
 * (loopback, linklocal, uniquelocal, an IP, or a CIDR range). Unset means
 * loopback, the documented topology: nginx on this host. Checked at boot by
 * config/validate.js, because a bad value makes app.set() throw.
 */
function trust_proxy_setting(raw) {

    const value = is_set(raw) ? String(raw).trim() : '';

    if (value === '') {
        return 'loopback';
    }

    if (value === 'true' || value === 'false') {
        return value === 'true';
    }

    if (/^\d+$/.test(value)) {
        return parseInt(value, 10);
    }

    return value;
}

module.exports = Object.freeze({
    /*
     * "production" marks the session cookie Secure, compresses responses and
     * caches compiled templates. The entrypoint defaults it to development
     * before this file loads; config/validate.js warns when a deployed host
     * still carries that.
     */
    node_env: process.env.NODE_ENV || 'development',
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
    /*
     * Sign-in callbacks accepted per client address per minute; sized for a
     * whole class behind one campus address (abuse throttling, not a security
     * control). Kept as given, so a typo is refused at boot rather than
     * silently becoming 300.
     */
    sso_rate_limit_per_minute: is_set(process.env.SSO_RATE_LIMIT_PER_MINUTE) ? Number(process.env.SSO_RATE_LIMIT_PER_MINUTE) : 300,
    /*
     * Express "trust proxy": which upstream addresses may set X-Forwarded-For.
     * req.ip - and with it every per-address rate limit - is only as right as
     * this. See trust_proxy_setting() above for the accepted forms.
     */
    trust_proxy: trust_proxy_setting(process.env.TRUST_PROXY),
    db_host: process.env.DB_HOST || '127.0.0.1',
    db_port: process.env.DB_PORT || 3306,
    db_user: process.env.DB_USER,
    db_password: process.env.DB_PASSWORD,
    db_name: process.env.DB_NAME || 'pdf_bookshelf',
    storage_path: process.env.STORAGE_PATH || './storage'
});
