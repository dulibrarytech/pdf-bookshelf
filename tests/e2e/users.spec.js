'use strict';

/*
 * The users page: the add form and its refusals, inline editing, the guard
 * on your own role, deactivate and reactivate.
 */

const { test, expect } = require('@playwright/test');
const { sign_in, next_dialog, menu_item, USERS, APP } = require('./harness/app');

const NEW = {du_id: '900000010', email: 'nina.new@du.edu', first_name: 'Nina', last_name: 'New'};

/**
 * The row for a person, pinned by its id: an open editor shows the name in
 * inputs, which a text match would not see
 */
async function user_row(page, name) {
    const id = await page.locator('#user-rows tr', {hasText: name}).getAttribute('id');
    return page.locator(`#${id}`);
}

test.describe('as an administrator', () => {

    test.beforeEach(async ({page}) => {
        await sign_in(page, USERS.ADMIN.du_id);
        await page.goto(`${APP}/dashboard/users`);
    });

    test('lists the dashboard users', async ({page}) => {

        const ada = await user_row(page, 'Ada Admin');
        const sam = await user_row(page, 'Sam Staff');

        await expect(ada.locator('td').nth(3)).toHaveText('admin');
        await expect(sam.locator('td').nth(3)).toHaveText('staff');
        await expect(sam.locator('td').nth(4)).toHaveText('active');
    });

    test('adds a user from the form, and refuses the same DU ID twice', async ({page}) => {

        await page.getByLabel('DU ID').fill(NEW.du_id);
        await page.getByLabel('Email').fill(NEW.email);
        await page.getByLabel('First name').fill(NEW.first_name);
        await page.getByLabel('Last name').fill(NEW.last_name);
        await page.getByRole('button', {name: 'Add user'}).click();

        const tr = page.locator('#user-rows tr', {hasText: 'Nina New'});
        await expect(tr).toHaveCount(1);
        await expect(tr.locator('td').nth(1)).toHaveText(NEW.du_id);
        await expect(tr.locator('td').nth(3)).toHaveText('staff');

        /* the form was reset for the next one */
        await expect(page.getByLabel('DU ID')).toHaveValue('');
        await expect(page.locator('#add-user-message')).toBeEmpty();

        await page.getByLabel('DU ID').fill(NEW.du_id);
        await page.getByLabel('Email').fill('again@du.edu');
        await page.getByLabel('First name').fill('Nina');
        await page.getByLabel('Last name').fill('Again');
        await page.getByRole('button', {name: 'Add user'}).click();

        await expect(page.locator('#add-user-message')).toContainText('A user with this DU ID already exists.');
        /* a refusal keeps what was typed */
        await expect(page.getByLabel('DU ID')).toHaveValue(NEW.du_id);
        await expect(page.locator('#user-rows tr', {hasText: 'Nina'})).toHaveCount(1);
    });

    test('a role is changed in the row', async ({page}) => {

        const tr = await user_row(page, 'Nina New');

        await (await menu_item(tr, 'Edit')).click();
        await tr.getByLabel('Role').selectOption('admin');
        await tr.getByRole('button', {name: 'Save'}).click();
        await expect(tr.locator('td').nth(3)).toHaveText('admin');

        await (await menu_item(tr, 'Edit')).click();
        await tr.getByLabel('Role').selectOption('staff');
        await tr.getByRole('button', {name: 'Save'}).click();
        await expect(tr.locator('td').nth(3)).toHaveText('staff');
    });

    test('your own role is not yours to change, and you cannot deactivate yourself', async ({page}) => {

        const tr = await user_row(page, 'Ada Admin');

        await tr.locator('.kebab-btn').click();
        await expect(tr.locator('.dropdown-menu .dropdown-item')).toHaveText([/Edit/]);
        await tr.locator('.dropdown-menu').getByRole('button', {name: 'Edit'}).click();

        await expect(tr.getByLabel('Role')).toHaveCount(0);
        await expect(tr.locator('.edit-static')).toHaveText(['admin', USERS.ADMIN.du_id]);

        await tr.getByRole('button', {name: 'Cancel'}).click();
        await expect(tr.locator('td').nth(3)).toHaveText('admin');
    });

    test('deactivate asks first, then reactivate', async ({page}) => {

        const tr = await user_row(page, 'Nina New');

        const dialog = next_dialog(page);
        await (await menu_item(tr, 'Deactivate')).click();
        expect(await dialog).toBe('Deactivate Nina New? They lose dashboard access but keep viewer access via SSO.');

        await expect(tr.locator('td').nth(4)).toHaveText('inactive');
        await expect(tr).toHaveClass(/table-secondary/);

        await (await menu_item(tr, 'Reactivate')).click();
        await expect(tr.locator('td').nth(4)).toHaveText('active');
        await expect(tr).not.toHaveClass(/table-secondary/);
    });
});
