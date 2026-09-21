'use strict';

/*
 * Migration 20260921000003 adds the unique index on tbl_users.du_id. Its
 * decisions are driven here with a knex stub whose raw() answers by the SQL it
 * is handed, so the refusal on existing duplicates, the re-run, and the
 * statement it issues are all pinned without a database.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');

const MIGRATION = require('../../knex/migrations/20260921000003_unique_du_id');

/**
 * @param state {duplicates: rows for the HAVING query, indexes: rows for SHOW INDEX}
 */
function knex_with(state) {

    const issued = [];

    return {
        issued,
        raw: (sql) => {

            issued.push(sql);

            if (/HAVING COUNT/.test(sql)) {
                return Promise.resolve([state.duplicates, []]);
            }

            if (/SHOW INDEX/.test(sql)) {
                return Promise.resolve([state.indexes, []]);
            }

            return Promise.resolve([[], []]);
        }
    };
}

test('refuses - naming the DU IDs - when a duplicate already exists, and changes nothing', async () => {

    const knex = knex_with({duplicates: [{du_id: '873542009', occurrences: 2}], indexes: []});

    await assert.rejects(() => MIGRATION.up(knex), /873542009 \(2 rows\)/);
    await assert.rejects(() => MIGRATION.up(knex), /delete the others/);
    assert.ok(!knex.issued.some((sql) => /ALTER TABLE/.test(sql)), knex.issued.join(' | '));
});

test('adds the unique index on a clean table', async () => {

    const knex = knex_with({duplicates: [], indexes: []});
    await MIGRATION.up(knex);

    assert.ok(knex.issued.some((sql) => /ADD UNIQUE INDEX idx_users_du_id \(du_id\)/.test(sql)), knex.issued.join(' | '));
});

test('a re-run with the index already in place issues nothing', async () => {

    /* a first run that failed after the ALTER (MySQL DDL cannot roll back) must not fail again */
    const knex = knex_with({duplicates: [], indexes: [{Key_name: 'idx_users_du_id'}]});
    await MIGRATION.up(knex);

    assert.ok(!knex.issued.some((sql) => /ALTER TABLE/.test(sql)), knex.issued.join(' | '));
});
