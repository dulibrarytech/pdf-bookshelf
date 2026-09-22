'use strict';

/*
 * Storage re-sync from the Utilities page: the background run, its polling
 * fragment, and the report.
 */

const FS = require('node:fs');
const PATH = require('node:path');
const { test, expect } = require('@playwright/test');
const { sign_in, USERS, APP, STORAGE_PATH, pdf_bytes } = require('./harness/app');

test('re-sync catalogues new files, explains what it skipped, and then reports in sync', async ({page}) => {

    await sign_in(page, USERS.ADMIN.du_id);

    FS.writeFileSync(PATH.join(STORAGE_PATH, 'minutes-2026.pdf'), pdf_bytes('Minutes 2026'));
    FS.writeFileSync(PATH.join(STORAGE_PATH, 'Probe.PDF'), pdf_bytes('Probe'));
    FS.writeFileSync(PATH.join(STORAGE_PATH, 'notes.txt'), 'not a pdf');

    await page.goto(`${APP}/dashboard/utils`);
    await page.getByRole('button', {name: 'Run re-sync'}).click();

    const report = page.locator('#resync-report');
    await expect(report).toContainText('Re-sync report', {timeout: 20_000});
    await expect(report).toContainText('1 added');
    await expect(report).toContainText('0 missing files');
    await expect(report).toContainText('2 skipped');
    await expect(report).toContainText('minutes-2026');
    await expect(report).toContainText('Probe.PDF');
    await expect(report).toContainText(/rename/i);
    await expect(report).toContainText('notes.txt');
    await expect(report).toContainText(/not a PDF/i);
    await expect(report).not.toContainText('in sync');

    /* the new record is on the bookshelf */
    await page.goto(`${APP}/dashboard/home`);
    await page.getByLabel('Search PDFs').fill('minutes');
    await expect(page.locator('#bookshelf-rows')).toContainText('minutes-2026.pdf');

    FS.unlinkSync(PATH.join(STORAGE_PATH, 'Probe.PDF'));
    FS.unlinkSync(PATH.join(STORAGE_PATH, 'notes.txt'));

    await page.goto(`${APP}/dashboard/utils`);
    await page.getByRole('button', {name: 'Run re-sync'}).click();
    await expect(report).toContainText('Storage and database are in sync.', {timeout: 20_000});
});
