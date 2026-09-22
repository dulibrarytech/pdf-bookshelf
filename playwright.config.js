'use strict';

/*
 * End-to-end suite: a real browser against the real app, which Playwright
 * boots on its own port with its own database and storage directory, so a
 * run never touches the development instance or its data.
 * tests/e2e/harness/start.js builds that environment - drops and recreates
 * the e2e database, migrates it, seeds users and PDFs, writes the PDFs into a
 * scratch storage directory - and then starts the app; harness/env.js is the
 * one place its settings live.
 *
 * The identity provider is never reached. The app is given
 * https://idp.example as SSO_URL, and every spec intercepts that origin in
 * the browser and answers as a stub which posts the callback the real proxy
 * would post (harness/app.js).
 *
 * One worker, files in order: everything shares one database and one
 * storage directory, and the suite is small enough that parallel workers
 * would buy little and cost determinism.
 */

const { defineConfig, devices } = require('@playwright/test');
const ENV = require('./tests/e2e/harness/env');

module.exports = defineConfig({
    testDir: './tests/e2e',
    testMatch: /.*\.spec\.js/,
    timeout: 30_000,
    expect: {timeout: 10_000},
    fullyParallel: false,
    workers: 1,
    retries: 0,
    forbidOnly: !!process.env.CI,
    reporter: [
        ['list'],
        ['html', {outputFolder: 'playwright-report', open: 'never'}]
    ],
    use: {
        baseURL: ENV.BASE_URL,
        trace: 'retain-on-failure',
        screenshot: 'only-on-failure',
        actionTimeout: 10_000
    },
    projects: [
        {name: 'chromium', use: {...devices['Desktop Chrome']}}
    ],
    webServer: {
        command: 'node tests/e2e/harness/start.js',
        /* 200 only once the database is up - the harness builds it first */
        url: `${ENV.BASE_URL}${ENV.VALUES.APP_PATH}/healthcheck`,
        reuseExistingServer: false,
        timeout: 90_000,
        env: ENV.VALUES,
        stdout: 'ignore',
        stderr: 'pipe'
    }
});
