'use strict';

/*
 * What every spec needs: who exists, how to sign in, and how to get through
 * the stub identity provider (harness/idp.js) the way a person would.
 */

const { expect } = require('@playwright/test');
const ENV = require('./env');
const SEED = require('./seed');
const { pdf_bytes } = require('./pdf');

const APP = ENV.VALUES.APP_PATH;
const IDP = ENV.IDP_URL;

/**
 * Signs the page's browser context in as a DU ID by posting the callback the
 * identity proxy would post. The context's request client shares its cookie
 * jar with its pages, so the session cookie lands where the pages send it.
 * The signature check is off in the e2e environment, as in development.
 * @param page
 * @param du_id
 */
exports.sign_in = async function (page, du_id) {

    const response = await page.request.post(`${APP}/sso`, {form: {employeeID: du_id}, maxRedirects: 0});

    expect(response.status(), `sign-in as ${du_id}`).toBe(303);
};

/**
 * On the stub identity provider's page: types the DU ID and continues, which
 * posts the callback to the app the way the real proxy does
 * @param page
 * @param du_id
 */
exports.continue_as = async function (page, du_id) {

    await expect(page).toHaveURL(new RegExp(`^${IDP}/sso`));
    await page.getByLabel('DU ID').fill(du_id);
    await page.getByRole('button', {name: 'Continue'}).click();
};

/**
 * The callback address the app sent the identity provider, read off the
 * stub's page
 * @param page
 * @returns {Promise<URL>}
 */
exports.callback_url = async function (page) {
    return new URL(await page.locator('#app-url').textContent());
};

/**
 * Accepts the next confirm() the page raises and resolves with its text.
 * Playwright dismisses dialogs it is not told about, which would cancel an
 * hx-confirm action.
 * @param page
 */
exports.next_dialog = function (page) {

    return new Promise(function (resolve) {
        page.once('dialog', function (dialog) {
            const message = dialog.message();
            dialog.accept().then(() => resolve(message));
        });
    });
};

/**
 * Opens a table row's kebab menu and returns the item with that name
 * @param row locator of the <tr>
 * @param name the item's text
 */
exports.menu_item = async function (row, name) {

    await row.locator('.kebab-btn').click();

    return row.locator('.dropdown-menu').getByRole('button', {name: name, exact: true});
};

exports.APP = APP;
exports.IDP = IDP;
exports.SSO_RESPONSE_URL = ENV.VALUES.SSO_RESPONSE_URL;
exports.STORAGE_PATH = ENV.VALUES.STORAGE_PATH;
exports.USERS = SEED.USERS;
exports.PDFS = SEED.PDFS;
exports.pdf_bytes = pdf_bytes;
