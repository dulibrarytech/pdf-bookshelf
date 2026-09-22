'use strict';

/*
 * The upload page through the browser's own file chooser, and the revive
 * path a removed record takes when its file is uploaded again.
 */

const FS = require('node:fs');
const PATH = require('node:path');
const { test, expect } = require('@playwright/test');
const { sign_in, USERS, APP, STORAGE_PATH, pdf_bytes } = require('./harness/app');
const DB = require('./harness/db');

const NAME = 'e2e-upload';

function file(text) {
    return {name: `${NAME}.pdf`, mimeType: 'application/pdf', buffer: pdf_bytes(text)};
}

async function upload(page, chosen) {
    await page.setInputFiles('#pdfs', chosen);
    await page.locator('#upload-submit').click();
    return page.locator('#upload-results');
}

test.describe('as staff', () => {

    test.beforeEach(async ({page}) => {
        await sign_in(page, USERS.STAFF.du_id);
        await page.goto(`${APP}/dashboard/upload`);
    });

    test('a PDF chosen on the page is saved, listed and stored', async ({page}) => {

        await page.setInputFiles('#pdfs', file('E2E Upload'));

        /* the page lists the choice and enables the button */
        await expect(page.locator('#upload-file-list')).toContainText(`${NAME}.pdf`);
        await expect(page.locator('#upload-submit')).toBeEnabled();

        await page.locator('#upload-submit').click();

        const results = page.locator('#upload-results');
        await expect(results).toContainText(`${NAME}.pdf`);
        await expect(results).toContainText('Saved.');
        await expect(results.locator('.badge')).toHaveClass(/text-bg-success/);

        /* the form is ready for the next one */
        await expect(page.locator('#upload-submit')).toBeDisabled();
        await expect(page.locator('#upload-file-list')).toBeHidden();

        expect(FS.existsSync(PATH.join(STORAGE_PATH, `${NAME}.pdf`))).toBe(true);

        await page.goto(`${APP}/dashboard/home`);
        await page.getByLabel('Search PDFs').fill(NAME);
        await expect(page.locator('#bookshelf-rows')).toContainText(`${NAME}.pdf`);
    });

    test('the same filename again is refused', async ({page}) => {

        const results = await upload(page, file('E2E Upload again'));

        await expect(results).toContainText('A PDF with this filename is already on the bookshelf.');
        await expect(results.locator('.badge')).toHaveText('rejected');
    });

    test('a file that is not a PDF never leaves the page', async ({page}) => {

        await page.setInputFiles('#pdfs', {name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('not a pdf')});

        await expect(page.locator('#upload-file-error')).toHaveText('Skipped (not PDF): notes.txt');
        await expect(page.locator('#upload-submit')).toBeDisabled();
    });
});

test('a removed record is revived by uploading its file again, and guarded while the file is still there', async ({page}) => {

    await sign_in(page, USERS.ADMIN.du_id);

    const db = DB.connect();

    try {
        const before = await db('tbl_pdfs').where({filename: NAME}).first();
        expect(before).toBeDefined();

        /* removed, and its file taken out of storage */
        expect((await page.request.delete(`${APP}/dashboard/pdfs/${before.uuid}`)).status()).toBe(200);
        FS.unlinkSync(PATH.join(STORAGE_PATH, `${NAME}.pdf`));

        await page.goto(`${APP}/dashboard/upload`);
        let results = await upload(page, file('E2E Upload revived'));
        await expect(results).toContainText('Saved. This filename belonged to a removed PDF; that record is back on the bookshelf with this file.');

        const revived = await db('tbl_pdfs').where({filename: NAME}).first();
        expect(revived.uuid).toBe(before.uuid);
        expect(Number(revived.is_active)).toBe(1);
        expect(Number(revived.file_size)).toBe(pdf_bytes('E2E Upload revived').length);

        /* removed again, file left in place: the upload points at Restore instead */
        expect((await page.request.delete(`${APP}/dashboard/pdfs/${before.uuid}`)).status()).toBe(200);

        await page.goto(`${APP}/dashboard/upload`);
        results = await upload(page, file('E2E Upload once more'));
        await expect(results).toContainText('its file is still in storage. Restore it from Bookshelf → Show removed');
        expect(Number((await db('tbl_pdfs').where({filename: NAME}).first()).is_active)).toBe(0);

        expect((await page.request.post(`${APP}/dashboard/pdfs/${before.uuid}/restore`)).status()).toBe(200);
        expect(Number((await db('tbl_pdfs').where({filename: NAME}).first()).is_active)).toBe(1);

    } finally {
        await db.destroy();
    }
});
