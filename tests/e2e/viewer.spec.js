'use strict';

/*
 * The pdf.js viewer as the app serves it: a document rendered end to end,
 * the viewer policy, the request count, legacy links, refusals, and the
 * sign-in round trip for a session that expires mid-document.
 */

const { test, expect } = require('@playwright/test');
const { sign_in, continue_as, callback_url, USERS, PDFS, APP, IDP } = require('./harness/app');

const [REPORT, BUDGET] = PDFS;

async function open_viewer(page, pdf) {
    await page.goto(`${APP}/viewer?pdf=${pdf}`);
    await expect(page.locator('#numPages')).toContainText('1');
    await expect(page.locator('#viewer .page canvas').first()).toBeVisible();
}

test.describe('as a dashboard user', () => {

    test.beforeEach(async ({page}) => {
        await sign_in(page, USERS.ADMIN.du_id);
    });

    test('renders a document served by the app', async ({page}) => {
        await open_viewer(page, REPORT.uuid);
        await expect(page.locator('.textLayer')).toContainText(REPORT.title);
    });

    test('the viewer policy holds: no download, no annotation editing, printing left alone', async ({page}) => {

        await open_viewer(page, REPORT.uuid);

        /* pdf.js hides the download controls with the attribute, the editor group with a class */
        await expect(page.locator('#downloadButton')).toHaveAttribute('hidden');
        await expect(page.locator('#secondaryDownload')).toHaveAttribute('hidden');
        await expect(page.locator('#editorModeButtons')).toHaveClass(/\bhidden\b/);
        await expect(page.locator('#editorSignature')).toHaveAttribute('hidden');
        await expect(page.locator('#printButton')).toBeVisible();

        /*
         * checkVisibility, not the computed display of the element itself: an
         * element inside a hidden ancestor computes as displayed
         */
        const policy = await page.evaluate(() => ({
            supportsDownloading: window.PDFViewerApplicationOptions.get('supportsDownloading'),
            annotationEditorMode: window.PDFViewerApplicationOptions.get('annotationEditorMode'),
            enableSignatureEditor: window.PDFViewerApplicationOptions.get('enableSignatureEditor'),
            disablePreferences: window.PDFViewerApplicationOptions.get('disablePreferences'),
            visible: ['downloadButton', 'secondaryDownload', 'editorModeButtons', 'editorSignature', 'editorStampButton', 'editorHighlightButton']
                .filter((id) => document.getElementById(id) !== null && document.getElementById(id).checkVisibility())
        }));

        expect(policy).toEqual({
            supportsDownloading: false,
            annotationEditorMode: -1,
            enableSignatureEditor: false,
            disablePreferences: true,
            visible: []
        });
    });

    test('opening a document counts one request', async ({page}) => {

        await page.goto(`${APP}/dashboard/home`);
        const cell = page.locator(`#pdf-${BUDGET.uuid} td`).nth(2);
        const before = Number(await cell.textContent());

        await open_viewer(page, BUDGET.uuid);

        await page.goto(`${APP}/dashboard/home`);
        await expect(cell).toHaveText(String(before + 1));
    });

    test('legacy catalogue links at the domain root land on the viewer', async ({page}) => {

        await page.goto(`/pdf/${REPORT.filename}`);
        await expect(page).toHaveURL(`${APP}/viewer?pdf=${REPORT.filename}`);
        await expect(page.locator('#numPages')).toContainText('1');

        await page.goto(`/viewer?pdf=${BUDGET.uuid}`);
        await expect(page).toHaveURL(`${APP}/viewer?pdf=${BUDGET.uuid}`);
        await expect(page.locator('#numPages')).toContainText('1');
    });

    test('an unknown or removed document is not served', async ({page}) => {

        await page.goto(`${APP}/viewer?pdf=00000000-0000-4000-8000-000000000000`);
        await expect(page.locator('main')).toContainText('PDF not found.');

        expect((await page.request.delete(`${APP}/dashboard/pdfs/${BUDGET.uuid}`)).status()).toBe(200);

        try {
            await page.goto(`${APP}/viewer?pdf=${BUDGET.uuid}`);
            await expect(page.locator('main')).toContainText('PDF not found.');
            expect((await page.request.get(`${APP}/pdf/${BUDGET.uuid}`)).status()).toBe(404);
        } finally {
            expect((await page.request.post(`${APP}/dashboard/pdfs/${BUDGET.uuid}/restore`)).status()).toBe(200);
        }
    });

    test('a session that expires while a document is open goes back through sign-in to the same document', async ({page, context}) => {

        await open_viewer(page, REPORT.uuid);

        await context.clearCookies();
        /* the next request pdf.js makes for the document answers 401; the page sends itself through sign-in */
        await page.evaluate(() => {
            window.fetch(document.documentElement.dataset.pdfUrl);
        });

        await expect(page).toHaveURL(new RegExp(`^${IDP}/sso`));
        expect((await callback_url(page)).searchParams.get('next')).toBe(`${APP}/viewer?pdf=${REPORT.uuid}`);

        /* and the round trip lands back on the document */
        await continue_as(page, USERS.ADMIN.du_id);
        await expect(page).toHaveURL(`${APP}/viewer?pdf=${REPORT.uuid}`);
        await expect(page.locator('#numPages')).toContainText('1');
    });
});

test.describe('browser support', () => {

    test.beforeEach(async ({page}) => {
        await sign_in(page, USERS.ADMIN.du_id);
    });

    test('the worker starts through the support shim, not the main-thread fallback', async ({page}) => {

        const requested = [];
        const console_lines = [];
        page.on('request', (request) => requested.push(request.url()));
        page.on('console', (message) => console_lines.push(message.text()));

        await open_viewer(page, REPORT.uuid);

        expect(await page.evaluate(() => window.PDFViewerApplicationOptions.get('workerSrc'))).toMatch(/\/static\/assets\/js\/pdf-worker\.mjs\?v=6\.3\.289&a=\w+$/);
        expect(page.workers().map((worker) => worker.url())).toEqual([expect.stringMatching(/\/static\/assets\/js\/pdf-worker\.mjs\?v=6\.3\.289&a=/)]);
        expect(requested).toEqual(expect.arrayContaining([
            expect.stringMatching(/\/static\/assets\/js\/browser-support\.js\?a=/),
            expect.stringMatching(/\/static\/libs\/pdfjs\/build\/pdf\.worker\.mjs\?v=6\.3\.289$/)
        ]));
        expect(console_lines.filter((line) => /fake worker/i.test(line))).toEqual([]);
    });

    test('a browser missing the newest built-ins still gets the viewer, find included', async ({page, context}) => {

        /* what Firefox 140 ESR and Safari 18.0-18.3 lack; the page's shims fill them in */
        await context.addInitScript(() => {
            delete Map.prototype.getOrInsertComputed;
            delete Map.prototype.getOrInsert;
            delete WeakMap.prototype.getOrInsertComputed;
            delete WeakMap.prototype.getOrInsert;
            delete Promise.try;
            delete RegExp.escape;
            delete Uint8Array.fromBase64;
            delete Uint8Array.prototype.toBase64;
        });

        await open_viewer(page, REPORT.uuid);
        await expect(page.locator('.textLayer')).toContainText(REPORT.title);

        await page.keyboard.press('Control+f');
        await page.locator('#findInput').fill('Annual');
        /* the label's text carries bidi isolation marks; the localisation arguments do not */
        await expect(page.locator('#findResultsCount')).toHaveAttribute('data-l10n-args', /"current":1,"total":1/);
    });

    test('a browser below the floor gets a plain message instead of a toolbar that never opens the document', async ({page, context}) => {

        /* pdf.js's library cannot load without iterator helpers (Firefox before 131, Safari before 18.4) */
        await context.addInitScript(() => {
            delete globalThis.Iterator;
        });

        await page.goto(`${APP}/viewer?pdf=${REPORT.uuid}`);

        await expect(page.getByRole('alert')).toContainText('This browser cannot open the document');
        await expect(page.getByRole('alert')).toContainText('Firefox 131 or newer');
        await expect(page.locator('#outerContainer')).toBeHidden();
    });
});

test('a viewer-tier session opens a document', async ({page}) => {

    await sign_in(page, USERS.VIEWER.du_id);
    await open_viewer(page, REPORT.uuid);
    await expect(page.locator('.textLayer')).toContainText(REPORT.title);
});
