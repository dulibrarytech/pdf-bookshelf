'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const MODEL = require('../../users/model');
const CONTROLLER = require('../../users/controller');

const last_admin = MODEL._is_last_active_admin;
const self_demotion = CONTROLLER._is_self_demotion;

test('last_active_admin: the sole active admin is protected', () => {
    assert.equal(last_admin(1, [1]), true);
});

test('last_active_admin: any peer admin releases the protection', () => {
    assert.equal(last_admin(1, [1, 18]), false);
    assert.equal(last_admin(18, [1, 18, 20]), false);
});

test('last_active_admin: a non-admin is never the last admin', () => {
    /* a staff user is absent from the active-admin list */
    assert.equal(last_admin(19, [1]), false);
    assert.equal(last_admin(19, []), false);
});

test('last_active_admin: an already-inactive admin is not protected', () => {
    /* deactivated admins are excluded from the list by the caller's query */
    assert.equal(last_admin(18, [1]), false);
});

test('self_demotion: an admin cannot take their own admin role away', () => {
    const admin = {id: 1, role: 'admin'};
    assert.equal(self_demotion(admin, 1, 'staff'), true);
    /* a missing role field reads as 'staff' downstream, so it counts too */
    assert.equal(self_demotion(admin, 1, ''), true);
});

test('self_demotion: editing your own row without touching the role is fine', () => {
    assert.equal(self_demotion({id: 1, role: 'admin'}, 1, 'admin'), false);
});

test('self_demotion: demoting somebody else is not self-demotion', () => {
    assert.equal(self_demotion({id: 1, role: 'admin'}, 18, 'staff'), false);
});

test('self_demotion: tolerates a missing actor', () => {
    assert.equal(self_demotion(undefined, 1, 'staff'), false);
});
