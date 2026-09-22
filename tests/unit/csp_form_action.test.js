'use strict';

/*
 * The CSP's form-action sources: this origin, and the identity provider's
 * origin when SSO_LOGOUT_URL is set. Chromium applies form-action to the
 * redirect a form submission is answered with, so the sign-out button's 303
 * to the provider needs that origin allowed.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { _form_action_sources: form_action_sources } = require('../../config/express');

test('this origin alone when signing out ends here', () => {
    assert.deepEqual(form_action_sources(undefined), ["'self'"]);
    assert.deepEqual(form_action_sources(''), ["'self'"]);
});

test("the identity provider's origin when signing out ends there", () => {
    assert.deepEqual(form_action_sources('https://login.du.edu/idp/profile/Logout?return=x'), ["'self'", 'https://login.du.edu']);
    assert.deepEqual(form_action_sources('http://localhost:8007/logout'), ["'self'", 'http://localhost:8007']);
});

test('a value that is not a URL adds nothing', () => {
    assert.deepEqual(form_action_sources('not a url'), ["'self'"]);
});
