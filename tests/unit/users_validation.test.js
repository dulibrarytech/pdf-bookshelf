'use strict';

/*
 * The rules that decide what may become a dashboard user. They run before any
 * database work, so a bad body is rejected rather than half-written.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const MODEL = require('../../users/model');

const profile = MODEL._validate_profile;
const du_id = MODEL._validate_du_id;

const VALID = {email: 'Sam.Staff@DU.edu', first_name: ' Sam ', last_name: ' Staff ', role: 'staff'};

test('a valid profile is normalised, not just accepted', () => {

    const result = profile(VALID);

    /* the email is the identity shown to staff, so case is not meaningful */
    assert.equal(result.email, 'sam.staff@du.edu');
    assert.equal(result.first_name, 'Sam');
    assert.equal(result.last_name, 'Staff');
    assert.equal(result.role, 'staff');
});

test('a missing role reads as staff, never as admin', () => {
    /* the safe direction: an omitted field must not grant privileges */
    assert.equal(profile({...VALID, role: undefined}).role, 'staff');
});

test('only the two known roles are accepted', () => {

    assert.equal(profile({...VALID, role: 'admin'}).role, 'admin');
    /* surrounding whitespace is trimmed, so a padded value still resolves */
    assert.equal(profile({...VALID, role: 'admin '}).role, 'admin');

    /* the whitelist is case-sensitive - "ADMIN" is not a role */
    for (const role of ['superuser', 'ADMIN', 'Admin', 'viewer', 'staff ']) {
        if (role === 'staff ') {
            continue;
        }
        assert.throws(() => profile({...VALID, role: role}), /Role must be/, `role ${JSON.stringify(role)}`);
    }
});

test('an empty role reads as staff, the same as omitting it', () => {

    /*
     * `body.role || 'staff'` treats '' as absent. Worth pinning: it is the
     * safe direction, and it is why the F9 self-demotion guard has to treat a
     * missing role as a demotion rather than as "no change".
     */
    assert.equal(profile({...VALID, role: ''}).role, 'staff');
    assert.equal(profile({...VALID, role: null}).role, 'staff');
});

test('an unusable email is refused', () => {
    for (const email of ['', 'nope', 'a@', '@du.edu', 'a b@du.edu', 'x'.repeat(250) + '@du.edu']) {
        assert.throws(() => profile({...VALID, email: email}), /valid email/, `email ${JSON.stringify(email)}`);
    }
});

test('names are required and bounded', () => {

    assert.throws(() => profile({...VALID, first_name: '   '}), /First and last name/);
    assert.throws(() => profile({...VALID, last_name: ''}), /First and last name/);
    assert.throws(() => profile({...VALID, first_name: 'x'.repeat(256)}), /First and last name/);
});

test('the DU ID is numeric and at most ten digits', () => {

    assert.equal(du_id({du_id: ' 871095226 '}), '871095226');

    for (const value of ['', '   ', 'abc', '87109522x', '12345678901', '871-095-226', undefined]) {
        assert.throws(() => du_id({du_id: value}), /DU ID must be numeric/, `du_id ${JSON.stringify(value)}`);
    }
});

test('the validators reject before anything reaches the database', async () => {

    /* create() validates first, so a bad body cannot half-write a user */
    await assert.rejects(() => MODEL.create({...VALID, email: 'nope'}), /valid email/);
    await assert.rejects(() => MODEL.update(1, {...VALID, role: 'superuser'}), /Role must be/);
});
