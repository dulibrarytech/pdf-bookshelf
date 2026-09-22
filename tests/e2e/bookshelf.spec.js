'use strict';

/*
 * The bookshelf page: search, sort, inline title editing, copy-to-clipboard,
 * remove / show removed / restore, and the refusal toast - the htmx
 * behaviours the integration suite cannot see.
 */

const { test, expect } = require('@playwright/test');
const { sign_in, next_dialog, menu_item, USERS, PDFS, APP } = require('./harness/app');
const DB = require('./harness/db');

const [REPORT, BUDGET, MAP] = PDFS;
const TITLES_SORTED = PDFS.map((pdf) => pdf.title).sort();

function row(page, pdf) {
    return page.locator(`#pdf-${pdf.uuid}`);
}

test.describe('as an administrator', () => {

    test.beforeEach(async ({page}) => {
        await sign_in(page, USERS.ADMIN.du_id);
        await page.goto(`${APP}/dashboard/home`);
    });

    test('lists the seeded PDFs with their file, size and request counts', async ({page}) => {

        for (const pdf of PDFS) {
            const tr = row(page, pdf);
            await expect(tr.locator('.package-name')).toHaveText(pdf.title);
            await expect(tr.locator('.package-sub')).toHaveText(`${pdf.filename}.pdf`);
            /* at least the seeded count: an earlier spec may have opened it */
            await expect(tr.locator('td').nth(2)).toHaveText(/^\d+$/);
            expect(Number(await tr.locator('td').nth(2).textContent())).toBeGreaterThanOrEqual(pdf.hits);
        }

        await expect(page.locator('#most-accessed-file')).toContainText(/Annual Report 2025|annual-report-2025/);
        await expect(page.locator('#bookshelf-count')).toHaveText(new RegExp(`^\\s*${PDFS.length} PDFs\\s*$`));
    });

    test('search narrows the table as you type, and the live region says so', async ({page}) => {

        const search = page.getByLabel('Search PDFs');

        await search.fill('budget');
        await expect(page.locator('#bookshelf-rows tr')).toHaveCount(1);
        await expect(row(page, BUDGET)).toBeVisible();
        await expect(page.locator('#bookshelf-count')).toHaveText(/1 PDF matching “budget”/);
        await expect(page.locator('#search-status')).toHaveText(/1 PDF matching “budget”/);

        await search.fill('no such document');
        await expect(page.locator('#bookshelf-rows')).toContainText('No PDFs match “no such document”.');

        await search.fill('');
        await expect(page.locator('#bookshelf-rows tr')).toHaveCount(PDFS.length);
    });

    test('the title column sorts both ways', async ({page}) => {

        async function sort_by_title() {

            /* the fragment swap replaces the rows; wait for the old ones to go */
            const old_rows = await page.locator('#bookshelf-rows').elementHandle();
            await page.locator('thead').getByRole('link', {name: 'Title'}).click();
            await old_rows.waitForElementState('hidden');

            return page.locator('#bookshelf-rows .package-name').allTextContents();
        }

        const first = await sort_by_title();
        const second = await sort_by_title();

        expect(first).not.toEqual(second);
        expect([first, second]).toEqual(expect.arrayContaining([TITLES_SORTED, [...TITLES_SORTED].reverse()]));
    });

    test('a title is edited in place, and focus comes back to the row', async ({page}) => {

        const tr = row(page, BUDGET);
        const input = page.locator(`#title-${BUDGET.uuid}`);

        await (await menu_item(tr, 'Edit title')).click();
        await expect(input).toHaveValue(BUDGET.title);
        await input.fill('Budget Summary (FY26)');
        await tr.getByRole('button', {name: 'Save'}).click();

        await expect(tr.locator('.package-name')).toHaveText('Budget Summary (FY26)');
        await expect(input).toHaveCount(0);

        /* WCAG 2.4.3: the swap that removed the editor did not drop focus on <body> */
        const focused = await page.evaluate(() => ({
            className: document.activeElement.className,
            row: document.activeElement.closest('tr') ? document.activeElement.closest('tr').id : ''
        }));
        expect(focused.className).toContain('kebab-btn');
        expect(focused.row).toBe(`pdf-${BUDGET.uuid}`);

        /* Cancel restores the row without saving */
        await (await menu_item(tr, 'Edit title')).click();
        await input.fill('discarded');
        await tr.getByRole('button', {name: 'Cancel'}).click();
        await expect(tr.locator('.package-name')).toHaveText('Budget Summary (FY26)');

        /* put it back */
        await (await menu_item(tr, 'Edit title')).click();
        await input.fill(BUDGET.title);
        await tr.getByRole('button', {name: 'Save'}).click();
        await expect(tr.locator('.package-name')).toHaveText(BUDGET.title);
    });

    test('an empty title is refused in the row', async ({page}) => {

        const tr = row(page, MAP);

        await (await menu_item(tr, 'Edit title')).click();
        await page.locator(`#title-${MAP.uuid}`).fill('');
        await tr.getByRole('button', {name: 'Save'}).click();

        await expect(page.locator('#bookshelf-rows')).toContainText('Title is required.');

        await page.reload();
        await expect(row(page, MAP).locator('.package-name')).toHaveText(MAP.title);
    });

    test('the catalogued URL is copied from the row, with visible and spoken feedback', async ({page, context}) => {

        await context.grantPermissions(['clipboard-read', 'clipboard-write']);

        await (await menu_item(row(page, MAP), 'Copy URL')).click();

        const expected = `${new URL(page.url()).origin}/pdf/${MAP.filename}`;
        const message = `URL for ${MAP.title} copied to clipboard: ${expected}`;

        await expect(page.locator('#copy-toast')).toHaveClass(/is-visible/);
        await expect(page.locator('#copy-toast')).toHaveText(message);
        await expect(page.locator('#copy-status')).toHaveText(message);
        expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(expected);
    });

    test('remove, show removed, restore', async ({page}) => {

        const tr = row(page, REPORT);

        const dialog = next_dialog(page);
        await (await menu_item(tr, 'Remove')).click();
        expect(await dialog).toContain('The file stays in storage');

        await expect(tr).toHaveCount(0);
        await expect(page.locator('#bookshelf-rows tr')).toHaveCount(PDFS.length - 1);

        await page.getByLabel('Show removed').check();
        await expect(tr).toHaveClass(/table-secondary/);
        await expect(tr.locator('.badge')).toHaveText('removed');
        await expect(page.locator('#bookshelf-count')).toContainText('including removed');

        /* Restore is the only action on a removed row */
        await tr.locator('.kebab-btn').click();
        const items = tr.locator('.dropdown-menu .dropdown-item');
        await expect(items).toHaveCount(1);
        await expect(items.first()).toHaveText(/Restore/);
        await items.first().click();

        await expect(tr).not.toHaveClass(/table-secondary/);
        await expect(tr.locator('.badge')).toHaveCount(0);
        await tr.locator('.kebab-btn').click();
        await expect(tr.locator('.dropdown-menu .dropdown-item')).toHaveCount(4);
        await page.keyboard.press('Escape');

        await page.getByLabel('Show removed').uncheck();
        await expect(row(page, REPORT)).toBeVisible();
        await expect(page.locator('#bookshelf-rows tr')).toHaveCount(PDFS.length);
    });

    test('a role that changes under an open page is enforced on the next action, with a toast', async ({page}) => {

        const db = DB.connect();

        try {
            await db('tbl_users').where({du_id: USERS.ADMIN.du_id}).update({role: 'staff'});

            const tr = row(page, MAP);
            const dialog = next_dialog(page);
            await (await menu_item(tr, 'Remove')).click();
            await dialog;

            await expect(page.locator('#copy-toast')).toHaveClass(/is-visible/);
            await expect(page.locator('#copy-toast')).toHaveText('You do not have permission to perform this action.');
            await expect(tr).toBeVisible();
            await expect(tr.locator('.badge')).toHaveCount(0);

        } finally {
            await db('tbl_users').where({du_id: USERS.ADMIN.du_id}).update({role: 'admin'});
            await db.destroy();
        }
    });
});

test('staff are not offered Remove', async ({page}) => {

    await sign_in(page, USERS.STAFF.du_id);
    await page.goto(`${APP}/dashboard/home`);

    const tr = row(page, MAP);
    await tr.locator('.kebab-btn').click();
    await expect(tr.locator('.dropdown-menu .dropdown-item')).toHaveText([/View/, /Copy URL/, /Edit title/]);
});
