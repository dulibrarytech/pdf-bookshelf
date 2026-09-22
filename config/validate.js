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
 * Boot-time configuration checks: anything whose absence would break the app
 * later and quietly is refused before the port binds, with its cause named.
 * Problems are collected rather than thrown one at a time. Fatal means the
 * app cannot do its job at all; a value that is merely weak, or limits one
 * feature, warns and lets the app run.
 */

const FS = require('node:fs');
const NET = require('node:net');
const PATH = require('node:path');
const JWT = require('jsonwebtoken');
/* required for its list only; the copy runs when the script is invoked directly */
const { ASSETS } = require('../scripts/vendor-assets');

const ROOT = PATH.join(__dirname, '..');

/* the secret is a shared string, so only HMAC algorithms can use it */
const TOKEN_ALGOS = ['HS256', 'HS384', 'HS512'];
/* 256 bits, the usual floor for an HMAC signing key */
const MIN_SECRET_LENGTH = 32;
/* the named address groups Express's trust-proxy setting understands */
const TRUST_KEYWORDS = ['loopback', 'linklocal', 'uniquelocal'];
/* names for this machine - a deployment reachable by these is not one */
const LOOPBACK_HOSTS = ['localhost', '127.0.0.1', '::1', '0.0.0.0'];
/* a session shorter than this cannot outlast the sign-in redirect */
const MIN_SESSION_SECONDS = 60;
/* beyond this, a stateless token outlives any reason to keep honouring it */
const LONG_SESSION_SECONDS = 7 * 24 * 3600;

function is_blank(value) {
    return value === undefined || value === null || String(value).trim().length === 0;
}

function is_directory(path) {

    try {
        return FS.statSync(path).isDirectory();
    } catch {
        return false;
    }
}

function is_file(path) {

    try {
        return FS.statSync(path).isFile();
    } catch {
        return false;
    }
}

/**
 * True when a host name means this machine (loopback, or a *.localhost name)
 * @param name a hostname, possibly bracketed IPv6
 */
function is_this_machine(name) {

    const host = String(name === undefined || name === null ? '' : name).trim().toLowerCase().replace(/^\[|\]$/g, '');

    return host.length === 0 || LOOPBACK_HOSTS.includes(host) || host.endsWith('.localhost');
}

/**
 * What says this configuration belongs to a deployed host, or null when
 * nothing does: the identity provider is told to post sign-ins to another
 * machine, or APP_HOST names one.
 * @param config
 */
function deployed_sign(config) {

    try {
        const host = new URL(config.sso_response_url).hostname;

        if (!is_this_machine(host)) {
            return `SSO_RESPONSE_URL sends sign-ins to ${host}`;
        }
    } catch {
        /* unset or not a URL - nothing to infer from it */
    }

    if (!is_this_machine(config.app_host)) {
        return `APP_HOST is ${config.app_host}`;
    }

    return null;
}

/**
 * How long a session signed with this TOKEN_EXPIRES lasts, in seconds -
 * measured by signing a throwaway token with the same library, so the verdict
 * is jsonwebtoken's own rather than a re-implementation of its parser.
 * @param expires config.token_expires
 * @returns {number|undefined} undefined when jsonwebtoken cannot use the value
 */
function session_seconds(expires) {

    try {
        const decoded = JWT.decode(JWT.sign({}, 'probe', {algorithm: 'HS256', expiresIn: expires}));
        return typeof decoded.exp === 'number' ? decoded.exp - decoded.iat : undefined;
    } catch {
        return undefined;
    }
}

/**
 * True when Express would accept the value as its trust-proxy setting: a
 * boolean, a hop count, or a comma-separated list of keywords, IP addresses
 * and CIDR ranges. Anything else makes app.set() throw.
 * @param value config.trust_proxy
 */
function valid_trust_proxy(value) {

    if (typeof value === 'boolean') {
        return true;
    }

    if (typeof value === 'number') {
        return Number.isInteger(value) && value >= 0;
    }

    if (typeof value !== 'string' || value.trim().length === 0) {
        return false;
    }

    return value.split(',').map((token) => token.trim()).every(function (token) {

        if (TRUST_KEYWORDS.includes(token)) {
            return true;
        }

        const [address, length, ...rest] = token.split('/');
        const family = NET.isIP(address);

        if (family === 0 || rest.length > 0) {
            return false;
        }

        if (length === undefined) {
            return true;
        }

        return /^\d+$/.test(length) && Number(length) <= (family === 4 ? 32 : 128);
    });
}

/**
 * Reports what is wrong with a configuration.
 * Pure apart from the injected filesystem probes, so the rules are testable
 * without touching the filesystem or booting anything.
 * @param config the CONFIG object
 * @param directory_exists (path) => boolean
 * @param file_exists (path) => boolean
 * @returns {{fatal: string[], warnings: string[]}}
 */
exports.inspect = function (config, directory_exists = is_directory, file_exists = is_file) {

    const fatal = [];
    const warnings = [];

    if (is_blank(config.token_secret)) {
        fatal.push('TOKEN_SECRET is not set. Session tokens cannot be signed, so every sign-in would fail with a generic error.');
    } else if (String(config.token_secret).length < MIN_SECRET_LENGTH) {
        warnings.push(`TOKEN_SECRET is shorter than ${MIN_SECRET_LENGTH} characters. Generate a long random value: openssl rand -hex 32`);
    }

    if (!TOKEN_ALGOS.includes(config.token_algo)) {
        fatal.push(`TOKEN_ALGO "${config.token_algo}" is not supported. Use one of: ${TOKEN_ALGOS.join(', ')}.`);
    }

    /* a session length jsonwebtoken cannot use fails every sign-in; a bare number is read as milliseconds */
    const expires = config.token_expires;
    const seconds = session_seconds(expires);

    if (seconds === undefined) {
        fatal.push(`TOKEN_EXPIRES "${expires}" is not a timespan jsonwebtoken understands. Use a number with a unit, e.g. 12h, 30m or 7d.`);
    } else if (typeof expires === 'string' && /^\s*\d+\s*$/.test(expires)) {
        fatal.push(`TOKEN_EXPIRES "${expires}" has no unit, and jsonwebtoken reads a bare number as milliseconds - a ${seconds}-second session. Write "${expires.trim()}s" for seconds, or e.g. 12h.`);
    } else if (seconds < MIN_SESSION_SECONDS) {
        fatal.push(`TOKEN_EXPIRES "${expires}" is ${seconds} seconds; a session that short cannot outlast the sign-in redirect. Use at least 1m.`);
    } else if (seconds > LONG_SESSION_SECONDS) {
        warnings.push(`TOKEN_EXPIRES "${expires}" is ${Math.round(seconds / 86400)} days. Sessions are stateless, so a token stays valid that long even after sign-out; 12h is the usual value.`);
    }

    if (is_blank(config.db_user)) {
        fatal.push('DB_USER is not set. The app cannot reach its database.');
    }

    if (is_blank(config.db_password)) {
        /* a passwordless local database is a legitimate dev setup */
        warnings.push('DB_PASSWORD is empty.');
    }

    if (!directory_exists(config.storage_path)) {

        const resolved = PATH.resolve(config.storage_path || '.');
        /*
         * a relative path resolves from the working directory the app was
         * started in, which is the usual reason this one bites on a deploy
         */
        const where = resolved === config.storage_path ? '' : ` (resolved to ${resolved})`;

        fatal.push(`STORAGE_PATH "${config.storage_path}"${where} is not a directory. Every PDF would 404.`);
    }

    /*
     * public/libs is copied from node_modules by scripts/vendor-assets.js
     * (npm's postinstall hook, or `npm run vendor`) and is not in git; a
     * checkout that skipped the step would serve the dashboard unstyled.
     * Source maps are not load-bearing.
     */
    const missing_assets = ASSETS
        .map(([, destination]) => destination)
        .filter((destination) => !destination.endsWith('.map') && !file_exists(PATH.join(ROOT, destination)));

    if (missing_assets.length > 0) {
        fatal.push(`Vendored client assets are missing: ${missing_assets.join(', ')}. Run "npm run vendor" - npm install and npm ci do it automatically unless scripts were skipped.`);
    }

    /*
     * Fails closed at request time already, but a sign-in returning 500 is a
     * poor way to learn the secret was never deployed.
     */
    if (config.sso_require_hmac && is_blank(config.sso_hmac_secret) && is_blank(config.sso_hmac_secret_next)) {
        fatal.push('SSO_REQUIRE_HMAC is on but neither SSO_HMAC_SECRET nor SSO_HMAC_SECRET_NEXT is set, so no callback could ever be verified.');
    }

    /*
     * Every route and asset URL is built by concatenating this, so a missing
     * leading slash leaves no separator before the route and a trailing one
     * leaves two - broken either way, and visible only as 404s. Empty is
     * allowed and mounts the app at the domain root.
     */
    const app_path = config.app_path === undefined ? '' : String(config.app_path);

    if (app_path.length > 0 && !app_path.startsWith('/')) {
        fatal.push(`APP_PATH "${app_path}" must start with "/".`);
    }

    if (app_path.endsWith('/')) {
        fatal.push(`APP_PATH "${app_path}" must not end with "/". Use an empty value to serve from the domain root.`);
    }

    const port = Number(config.app_port);

    if (!Number.isInteger(port) || port < 1 || port > 65535) {
        fatal.push(`APP_PORT "${config.app_port}" is not a valid port number.`);
    }

    /*
     * The sign-in limiter is keyed by client address, and DU users arrive
     * behind campus NAT and VPN egress addresses, so it must absorb a whole
     * class at once. An unusable value would quietly become "refuse everyone"
     * or "refuse nobody"; refuse to start instead.
     */
    const limit = config.sso_rate_limit_per_minute;

    if (!Number.isInteger(limit) || limit < 1) {
        fatal.push(`SSO_RATE_LIMIT_PER_MINUTE "${limit}" must be a whole number of sign-in callbacks per minute, at least 1.`);
    }

    if (!valid_trust_proxy(config.trust_proxy)) {
        fatal.push(`TRUST_PROXY "${config.trust_proxy}" is not usable. Use true, false, a hop count, or a comma-separated list of loopback, linklocal, uniquelocal, IP addresses or CIDR ranges.`);
    }

    /*
     * Say which SSO verification layers are inactive. Warnings, never fatal:
     * both default off because the DU authproxy does not sign its callbacks
     * yet, a position coordinated with DU IT.
     */
    if (!config.sso_require_hmac) {

        warnings.push(is_blank(config.sso_host)
            ? 'SSO callbacks are NOT signature-verified (SSO_REQUIRE_HMAC is off) and SSO_HOST is not set, so nothing narrows who may post an identity to /sso. Set SSO_HOST in any deployed environment.'
            : `SSO callbacks are NOT signature-verified (SSO_REQUIRE_HMAC is off). Identity is taken from the callback body, with the SSO_HOST match against "${config.sso_host}" as the only gate. Enabling HMAC is coordinated with DU IT.`);
    }

    /*
     * Freshness follows the signature (auth/controller.js): with HMAC on the
     * timestamp and nonce are always checked, whatever SSO_REQUIRE_FRESHNESS
     * says, so the flag off beside HMAC on is a contradiction worth naming;
     * "not checked for freshness" is only true with both off.
     */
    if (config.sso_require_hmac && !config.sso_require_freshness) {
        warnings.push('SSO_REQUIRE_FRESHNESS is off but SSO_REQUIRE_HMAC is on: a signed callback is always checked for freshness (the signature covers the timestamp and nonce so a captured callback cannot be replayed), so the flag is ignored. Set it to 1, or remove it.');
    } else if (!config.sso_require_freshness) {
        warnings.push('SSO callbacks are NOT checked for freshness (SSO_REQUIRE_FRESHNESS is off, and it follows SSO_REQUIRE_HMAC, also off), so a captured callback can be replayed.');
    }

    if (is_blank(config.sso_url)) {
        /*
         * /login answers with a clear 503, so this limits a feature rather
         * than breaking the app - the dashboard still works for a session
         * obtained another way
         */
        warnings.push('SSO_URL is not set, so /login cannot start a sign-in.');
    }

    /*
     * NODE_ENV=production is what marks the session cookie Secure, compresses
     * responses and caches compiled templates; a deployment that keeps
     * "development" serves a cookie any plain-http hop could read. A warning,
     * never fatal: a development machine reachable by name is legitimate.
     */
    const sign = config.node_env === 'production' ? null : deployed_sign(config);

    if (sign !== null) {
        warnings.push(`NODE_ENV is "${config.node_env}" but ${sign}. On a deployed host set NODE_ENV=production: without it the session cookie is not marked Secure, responses are not compressed and templates are re-read on every request.`);
    }

    return {fatal, warnings};
};

/**
 * One line for a server that could not start listening: a port already in
 * use, one this user may not bind, or the error code.
 * @param error the 'error' event's error
 * @param port what the app tried to listen on
 */
exports.describe_listen_error = function (error, port) {

    if (error.code === 'EADDRINUSE') {
        return `port ${port} is already in use. Another copy of the app, or something else, is listening on it - stop that, or set APP_PORT to a free port.`;
    }

    if (error.code === 'EACCES') {
        return `port ${port} needs privileges this user does not have (ports below 1024 usually do). Set APP_PORT higher and let the proxy front it.`;
    }

    return `the server could not listen on port ${port}: ${error.code || error.message}.`;
};

/**
 * Runs the checks, reports everything found, and stops the process if any
 * problem is fatal.
 * @param config
 * @param logger a log4 module logger
 */
exports.enforce = function (config, logger) {

    const { fatal, warnings } = exports.inspect(config);

    for (const warning of warnings) {
        logger.warn('CONFIG: ' + warning);
    }

    if (fatal.length === 0) {
        return;
    }

    /*
     * console.error, not the logger: log4js buffers its file appender and
     * process.exit does not wait for the flush.
     */
    const count = fatal.length === 1 ? '1 configuration problem' : `${fatal.length} configuration problems`;

    console.error(`\n${config.app_name} cannot start - ${count}:\n`);

    for (const problem of fatal) {
        console.error('  * ' + problem);
    }

    console.error('\nSet these in .env (see .env-example) and start again.\n');
    process.exit(1);
};
