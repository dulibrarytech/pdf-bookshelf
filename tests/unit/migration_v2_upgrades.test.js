'use strict';

/*
 * Migration 20260720000002 must be re-runnable from any point it might have
 * failed at, because MySQL commits DDL as it goes and knex's transaction
 * cannot undo a half-applied run. These drive up() against a stub database in
 * each half-applied state and record what it issues.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');

const MIGRATION = require('../../knex/migrations/20260720000002_v2_upgrades');

/**
 * A knex stub describing a database's state, recording every statement.
 * @param state {tables, columns: {table: [names]}, indexes, unfilled_uuids, admins}
 */
function database(state) {

    const issued = [];
    const tables = new Set(state.tables);
    const indexes = new Set(state.indexes || []);
    const columns = Object.fromEntries(Object.entries(state.columns || {}).map(([table, names]) => [table, new Set(names)]));

    function builder(table) {

        const chain = {
            whereNull: () => chain,
            where: () => chain,
            select: () => { issued.push(`select:${table}`); return Promise.resolve(table === 'tbl_pdfs' ? (state.unfilled_uuids || []).map((id) => ({id})) : []); },
            update: (values) => { issued.push(`update:${table}:${Object.keys(values).join(',')}`); return Promise.resolve(1); },
            count: () => { issued.push(`count:${table}`); return Promise.resolve([{admins: state.admins || 0}]); }
        };

        return chain;
    }

    const knex = builder;

    knex.raw = function (sql) {

        const text = String(sql).replace(/\s+/g, ' ').trim();
        issued.push(`raw:${text}`);

        if (/^SHOW INDEX/.test(text)) {
            const name = /Key_name = '(\w+)'/.exec(text)[1];
            return Promise.resolve([indexes.has(name) ? [{Key_name: name}] : [], []]);
        }

        return Promise.resolve([[], []]);
    };

    knex.schema = {
        hasTable: (table) => Promise.resolve(tables.has(table)),
        hasColumn: (table, column) => Promise.resolve((columns[table] || new Set()).has(column)),
        renameTable: (from, to) => { issued.push(`rename:${from}->${to}`); return Promise.resolve(); }
    };

    knex.ref = (name) => name;

    return {knex, issued};
}

const V1_COLUMNS = {tbl_data: ['id', 'filename', 'file_size', 'hits', 'created'], tbl_users: ['id', 'du_id', 'email', 'first_name', 'last_name', 'is_active', 'created']};
const V2_COLUMNS = {tbl_pdfs: ['id', 'uuid', 'filename', 'title', 'file_size', 'sha256', 'hits', 'is_active', 'uploaded_by', 'created', 'updated'], tbl_users: [...V1_COLUMNS.tbl_users, 'role']};
const V2_INDEXES = ['idx_pdfs_uuid', 'idx_pdfs_filename'];

const has = (issued, part) => issued.some((line) => line.includes(part));
const position = (issued, part) => issued.findIndex((line) => line.includes(part));

test('a fresh v1 database gets every step, in order', async () => {

    const db = database({tables: ['tbl_data', 'tbl_users'], columns: V1_COLUMNS, unfilled_uuids: [1, 2, 3]});
    await MIGRATION.up(db.knex);

    for (const step of ['rename:tbl_data->tbl_pdfs', 'CONVERT TO CHARACTER SET', 'ADD COLUMN uuid', 'MODIFY COLUMN uuid CHAR(36) NOT NULL', 'ADD UNIQUE INDEX idx_pdfs_uuid', 'ADD UNIQUE INDEX idx_pdfs_filename', 'ADD COLUMN role', 'update:tbl_users:role']) {
        assert.ok(has(db.issued, step), `expected ${step} in:\n${db.issued.join('\n')}`);
    }

    /* three rows without a uuid, three backfills - and all before the NOT NULL */
    assert.equal(db.issued.filter((line) => line === 'update:tbl_pdfs:uuid').length, 3);
    assert.ok(position(db.issued, 'update:tbl_pdfs:uuid') < position(db.issued, 'MODIFY COLUMN uuid CHAR(36) NOT NULL'));
    assert.ok(position(db.issued, 'ADD UNIQUE INDEX idx_pdfs_uuid') < position(db.issued, 'ADD COLUMN role'));
});

test('a run that failed before the indexes finishes the job on the next run', async () => {

    /* the columns are there and filled; the indexes and the role column are not */
    const db = database({tables: ['tbl_pdfs', 'tbl_users'], columns: {tbl_pdfs: V2_COLUMNS.tbl_pdfs, tbl_users: V1_COLUMNS.tbl_users}, unfilled_uuids: []});
    await MIGRATION.up(db.knex);

    assert.ok(!has(db.issued, 'rename:'), 'the table was already renamed');
    assert.ok(!has(db.issued, 'ADD COLUMN uuid'), 'the columns were already added');
    assert.ok(has(db.issued, 'ADD UNIQUE INDEX idx_pdfs_uuid'));
    assert.ok(has(db.issued, 'ADD UNIQUE INDEX idx_pdfs_filename'));
    assert.ok(has(db.issued, 'ADD COLUMN role'));
    assert.ok(has(db.issued, 'update:tbl_users:role'));
});

test('a run that failed after the indexes does not try to add them again', async () => {

    /*
     * the regression: the unique-index step had no guard, so the second run
     * of a half-applied migration failed on "Duplicate key name" for good
     */
    const db = database({tables: ['tbl_pdfs', 'tbl_users'], columns: V2_COLUMNS, indexes: V2_INDEXES, admins: 0});
    await MIGRATION.up(db.knex);

    assert.ok(!has(db.issued, 'ADD UNIQUE INDEX'), db.issued.join('\n'));
    assert.ok(!has(db.issued, 'ADD COLUMN'), db.issued.join('\n'));

    /* the role column exists but was never filled: every v1 user must still become an admin */
    assert.ok(has(db.issued, 'update:tbl_users:role'));
});

test('a database where it all ran is left alone - a demoted user stays demoted', async () => {

    const db = database({tables: ['tbl_pdfs', 'tbl_users'], columns: V2_COLUMNS, indexes: V2_INDEXES, admins: 3});
    await MIGRATION.up(db.knex);

    assert.ok(!has(db.issued, 'ADD '), db.issued.join('\n'));
    assert.ok(!has(db.issued, 'rename:'));
    assert.ok(!has(db.issued, 'update:tbl_users:role'), 'must not re-promote anyone');
});
