'use strict';

const PATH = require('node:path');

const ROOT = PATH.join(__dirname, '../../..');
const APP_PORT = process.env.E2E_APP_PORT || '8006';
const APP_PATH = '/bookshelf';
/* the stub identity provider (harness/idp.js), started by start.js */
const IDP_PORT = process.env.E2E_IDP_PORT || '8007';
const IDP_URL = `http://localhost:${IDP_PORT}`;

/*
 * Everything the e2e app runs with. playwright.config.js passes it to the
 * server process, and harness/start.js applies it when run by hand, so the
 * two cannot disagree. The database host, port and credentials are the only
 * values taken from the developer's .env (harness/db.js); the database NAME
 * is fixed here, because start.js drops and recreates it.
 *
 * SSO_HOST and the signature flags are set explicitly, to their off values:
 * the app's dotenv fills in any key that is absent from the environment, a
 * developer's .env may set them, and either would have the stub identity
 * provider's callback refused. The identity provider is the stub server on
 * IDP_PORT, so the app's own redirects reach it - nothing is intercepted.
 */
const VALUES = Object.freeze({
    NODE_ENV: 'test',
    APP_HOST: 'localhost',
    APP_PORT: APP_PORT,
    APP_PATH: APP_PATH,
    DB_NAME: 'pdf_bookshelf_e2e',
    STORAGE_PATH: PATH.join(ROOT, 'tests/e2e/.storage'),
    TOKEN_SECRET: 'e2e-only-secret-long-enough-for-the-boot-check',
    TOKEN_ISSUER: 'pdf-bookshelf-e2e',
    TOKEN_ALGO: 'HS512',
    TOKEN_EXPIRES: '1h',
    SSO_URL: `${IDP_URL}/sso`,
    SSO_RESPONSE_URL: `http://localhost:${APP_PORT}${APP_PATH}/sso`,
    SSO_LOGOUT_URL: `${IDP_URL}/logout`,
    SSO_HOST: '',
    SSO_REQUIRE_HMAC: '0',
    SSO_REQUIRE_FRESHNESS: '0',
    SSO_RATE_LIMIT_PER_MINUTE: '300',
    TRUST_PROXY: ''
});

exports.ROOT = ROOT;
exports.VALUES = VALUES;
exports.BASE_URL = `http://localhost:${APP_PORT}`;
exports.IDP_PORT = Number(IDP_PORT);
exports.IDP_URL = IDP_URL;

/**
 * Puts the values into this process's environment where they are not
 * already there - which they are when Playwright started the process
 */
exports.apply = function () {

    for (const [key, value] of Object.entries(VALUES)) {

        if (process.env[key] === undefined) {
            process.env[key] = value;
        }
    }
};
