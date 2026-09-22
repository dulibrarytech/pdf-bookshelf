'use strict';

/*
 * Sign-in, tiers and sign-out, through a real browser: the app's redirects,
 * the identity provider's callback (harness/idp.js stands in for it), the
 * cookie, and what each tier is shown.
 */

const { test, expect } = require('@playwright/test');
const { sign_in, continue_as, callback_url, USERS, PDFS, APP, IDP, SSO_RESPONSE_URL } = require('./harness/app');

test('the bare hostname and the app root go to the identity provider with the callback address', async ({page}) => {

    for (const path of ['/', APP, `${APP}/`]) {
        await page.goto(path);
        await expect(page).toHaveURL(new RegExp(`^${IDP}/sso`));
        /* no target: the callback routes by tier afterwards */
        expect((await callback_url(page)).href).toBe(SSO_RESPONSE_URL);
    }
});

test('a signed-out request for a dashboard page comes back to that page after the round trip', async ({page}) => {

    await page.goto(`${APP}/dashboard/upload`);

    const callback = await callback_url(page);
    expect(callback.origin + callback.pathname).toBe(SSO_RESPONSE_URL);
    expect(callback.searchParams.get('next')).toBe(`${APP}/dashboard/upload`);

    await continue_as(page, USERS.STAFF.du_id);

    await expect(page).toHaveURL(`${APP}/dashboard/upload`);
    await expect(page.getByRole('heading', {level: 1})).toHaveText('Upload PDFs');
});

test('without a target, the callback routes by tier', async ({page}) => {

    await page.goto(`${APP}/login`);
    await continue_as(page, USERS.VIEWER.du_id);
    await expect(page).toHaveURL(`${APP}/signed-in`);
    await expect(page.locator('main')).toContainText('You are signed in. Follow a PDF link to open a document.');

    await page.goto(`${APP}/login`);
    await continue_as(page, USERS.ADMIN.du_id);
    await expect(page).toHaveURL(`${APP}/dashboard/home`);
    await expect(page.getByRole('heading', {level: 1})).toHaveText('Bookshelf');
});

test('a viewer is kept out of the dashboard but can open a document', async ({page}) => {

    await sign_in(page, USERS.VIEWER.du_id);

    await page.goto(`${APP}/dashboard/home`);
    await expect(page.locator('main')).toContainText('You do not have access to the dashboard.');
    await expect(page.locator('nav.app-sidebar')).toHaveCount(0);

    await page.goto(`${APP}/viewer?pdf=${PDFS[0].uuid}`);
    await expect(page.locator('#numPages')).toContainText('1');
});

test('staff get the bookshelf and upload, not users or utilities', async ({page}) => {

    await sign_in(page, USERS.STAFF.du_id);
    await page.goto(`${APP}/dashboard/home`);

    await expect(page).toHaveTitle('Bookshelf - PDF Bookshelf @ DU');
    await expect(page.locator('.user-label')).toHaveText(/Sam Staff/);

    const nav = page.locator('nav.app-sidebar');
    await expect(nav.getByRole('link', {name: 'Bookshelf'})).toBeVisible();
    await expect(nav.getByRole('link', {name: 'Upload'})).toBeVisible();
    await expect(nav.getByRole('link', {name: 'Users'})).toHaveCount(0);
    await expect(nav.getByRole('link', {name: 'Utilities'})).toHaveCount(0);

    for (const path of ['/dashboard/users', '/dashboard/utils']) {
        await page.goto(APP + path);
        await expect(page.locator('main')).toContainText('You do not have permission to perform this action.');
    }
});

test('an administrator gets every section', async ({page}) => {

    await sign_in(page, USERS.ADMIN.du_id);
    await page.goto(`${APP}/dashboard/home`);

    const nav = page.locator('nav.app-sidebar');
    await expect(nav.getByRole('link')).toHaveCount(4);

    for (const name of ['Bookshelf', 'Upload', 'Users', 'Utilities']) {
        await expect(nav.getByRole('link', {name: name})).toBeVisible();
    }
});

test('signing out from the header clears the session and goes to the identity provider', async ({page, context}) => {

    await sign_in(page, USERS.ADMIN.du_id);
    await page.goto(`${APP}/dashboard/home`);

    await page.locator('form.sign-out button').click();

    await expect(page).toHaveURL(`${IDP}/logout`);
    await expect(page.locator('h1')).toHaveText('Signed out at the identity provider');

    const cookies = await context.cookies();
    expect(cookies.find((cookie) => cookie.name === 'bookshelf_session')).toBeUndefined();

    await page.goto(`${APP}/dashboard/home`);
    await expect(page).toHaveURL(new RegExp(`^${IDP}/sso`));
});

test('a typed sign-out address only asks; its button signs out', async ({page}) => {

    await sign_in(page, USERS.STAFF.du_id);

    await page.goto(`${APP}/logout`);
    await expect(page.locator('main')).toContainText('Sign out of PDF Bookshelf?');

    /* nothing changed: the session still opens the bookshelf */
    await page.goto(`${APP}/dashboard/home`);
    await expect(page).toHaveTitle(/^Bookshelf/);

    await page.goto(`${APP}/logout`);
    await page.getByRole('button', {name: 'Sign out'}).click();
    await expect(page).toHaveURL(`${IDP}/logout`);
});
