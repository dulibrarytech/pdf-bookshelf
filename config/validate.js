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
 * Boot-time configuration checks.
 *
 * The failure this exists to prevent: with TOKEN_SECRET unset the app starts
 * cleanly, renders pages and passes /healthcheck - which only pings the
 * database - and then fails every single sign-in with a generic
 * "Authentication failed.", logged as `rejected:error`. The actual cause
 * appears nowhere. Anything whose absence breaks the app only later, and
 * quietly, belongs here instead: the process refuses to start and says
 * exactly what is wrong.
 *
 * Problems are collected rather than thrown one at a time, so someone fixing
 * a deployment sees every missing value in one pass instead of discovering
 * the next one on each restart.
 *
 * Fatal vs warning: fatal means the app cannot do its job at all. A value
 * that is merely weak or limits one feature warns and lets the app run -
 * refusing to boot over a judgement call would strand a working deployment
 * on an upgrade.
 */

const FS = require('node:fs');
const PATH = require('node:path');

/* the secret is a shared string, so only HMAC algorithms can use it */
const TOKEN_ALGOS = ['HS256', 'HS384', 'HS512'];
/* 256 bits, the usual floor for an HMAC signing key */
const MIN_SECRET_LENGTH = 32;

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

/**
 * Reports what is wrong with a configuration.
 * Pure apart from the injected directory probe, so the rules are testable
 * without touching the filesystem or booting anything.
 * @param config the CONFIG object
 * @param directory_exists (path) => boolean
 * @returns {{fatal: string[], warnings: string[]}}
 */
exports.inspect = function (config, directory_exists = is_directory) {

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
     * Say out loud which SSO verification layers are inactive.
     *
     * Both are built and tested but default off, because the DU authproxy does
     * not sign its callbacks yet - a deliberate, coordinated position, not a
     * defect to fix here. What WAS a defect is that nothing said so: the app
     * booted silently and you had to read config to learn that identity is
     * whatever the callback POSTs. These are warnings, never fatal, precisely
     * because this is the intended posture today.
     */
    if (!config.sso_require_hmac) {

        warnings.push(is_blank(config.sso_host)
            ? 'SSO callbacks are NOT signature-verified (SSO_REQUIRE_HMAC is off) and SSO_HOST is not set, so nothing narrows who may post an identity to /sso. Set SSO_HOST in any deployed environment.'
            : `SSO callbacks are NOT signature-verified (SSO_REQUIRE_HMAC is off). Identity is taken from the callback body, with the SSO_HOST match against "${config.sso_host}" as the only gate. Enabling HMAC is coordinated with DU IT.`);
    }

    if (!config.sso_require_freshness) {
        warnings.push('SSO callbacks are NOT checked for freshness (SSO_REQUIRE_FRESHNESS is off), so a captured callback can be replayed.');
    }

    if (is_blank(config.sso_url)) {
        /*
         * /login answers with a clear 503, so this limits a feature rather
         * than breaking the app - the dashboard still works for a session
         * obtained another way
         */
        warnings.push('SSO_URL is not set, so /login cannot start a sign-in.');
    }

    return {fatal, warnings};
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
     * process.exit does not wait for the flush, so a logged message can be
     * lost precisely when it matters most. stderr is also where an operator
     * looks when a service refuses to start.
     */
    const count = fatal.length === 1 ? '1 configuration problem' : `${fatal.length} configuration problems`;

    console.error(`\n${config.app_name} cannot start - ${count}:\n`);

    for (const problem of fatal) {
        console.error('  * ' + problem);
    }

    console.error('\nSet these in .env (see .env-example) and start again.\n');
    process.exit(1);
};
