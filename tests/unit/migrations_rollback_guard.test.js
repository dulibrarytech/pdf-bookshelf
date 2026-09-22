'use strict';

/*
 * Rolling back 002 drops tbl_pdfs.uuid. Those identifiers were minted when the
 * migration ran, so they cannot be regenerated - re-running up() produces
 * different ones and every catalogued PDF link breaks. knex offers rollback
 * unconditionally, so the refusal has to live in the migration itself.
 *
 * These call down() with a knex stub that records every use. If a guard ever
 * regresses, the stub shows it was reached rather than the test quietly
 * passing on an unrelated error.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');

const BASELINE = require('../../knex/migrations/20260720000001_v1_baseline');
const UPGRADES = require('../../knex/migrations/20260720000002_v2_upgrades');
const UNIQUE_DU_ID = require('../../knex/migrations/20260921000003_unique_du_id');

function recording_knex() {

    const used = [];
    const stub = function (table) {
        used.push(`query:${table}`);
        return stub;
    };

    stub.used = used;
    stub.raw = (sql) => { used.push(`raw:${String(sql).trim().slice(0, 40)}`); return Promise.resolve(); };
    stub.schema = {
        renameTable: (from, to) => { used.push(`rename:${from}->${to}`); return Promise.resolve(); },
        hasTable: () => Promise.resolve(true),
        hasColumn: () => Promise.resolve(true)
    };

    return stub;
}

test('rolling back the v2 upgrades is refused by default', async () => {

    delete process.env.ALLOW_DESTRUCTIVE_ROLLBACK;
    const knex = recording_knex();

    await assert.rejects(() => UPGRADES.down(knex), /Refusing to roll back/);

    /* it must refuse BEFORE issuing any statement */
    assert.deepEqual(knex.used, [], 'the guard let a statement through');
});

test('the refusal explains what is lost and how to proceed on a disposable database', async () => {

    delete process.env.ALLOW_DESTRUCTIVE_ROLLBACK;

    const message = await UPGRADES.down(recording_knex()).catch((error) => error.message);

    assert.match(message, /uuid/);
    assert.match(message, /cannot be recovered/);
    assert.match(message, /Restore from a dump/);
    assert.match(message, /ALLOW_DESTRUCTIVE_ROLLBACK=1/);
});

test('an explicit opt-in lets a disposable database roll back', async () => {

    process.env.ALLOW_DESTRUCTIVE_ROLLBACK = '1';
    const knex = recording_knex();

    try {
        await UPGRADES.down(knex);
    } finally {
        delete process.env.ALLOW_DESTRUCTIVE_ROLLBACK;
    }

    /* the real statements run, and the table goes back to its v1 name */
    assert.ok(knex.used.some((u) => u.includes('DROP COLUMN role')), knex.used.join(', '));
    assert.ok(knex.used.includes('rename:tbl_pdfs->tbl_data'), knex.used.join(', '));
});

test('rolling back the baseline is refused - there is nothing to reverse', async () => {

    delete process.env.ALLOW_DESTRUCTIVE_ROLLBACK;
    const knex = recording_knex();

    await assert.rejects(() => BASELINE.down(knex), /nothing to reverse/);
    assert.deepEqual(knex.used, []);
});

test('rolling back the du_id index is refused without the opt-in, like every other migration', async () => {

    /*
     * dropping the index loses nothing, but on a fresh database all three
     * migrations share a batch - a quiet success here would leave it
     * half-reversed when 002 refuses next
     */
    delete process.env.ALLOW_DESTRUCTIVE_ROLLBACK;
    const knex = recording_knex();

    await assert.rejects(() => UNIQUE_DU_ID.down(knex), /ALLOW_DESTRUCTIVE_ROLLBACK=1/);
    assert.deepEqual(knex.used, []);
});

test('with the opt-in, rolling back the du_id index drops it', async () => {

    process.env.ALLOW_DESTRUCTIVE_ROLLBACK = '1';
    const knex = recording_knex();

    try {
        await UNIQUE_DU_ID.down(knex);
    } finally {
        delete process.env.ALLOW_DESTRUCTIVE_ROLLBACK;
    }

    /* the stub records the first 40 characters of each statement */
    assert.ok(knex.used.some((u) => u.startsWith('raw:ALTER TABLE tbl_users DROP INDEX')), knex.used.join(', '));
});

test('the baseline no-ops under the opt-in so the batch can roll back cleanly', async () => {

    /*
     * both migrations share batch 1, so rollback takes them together - the
     * baseline refusing here would abort the batch half-done
     */
    process.env.ALLOW_DESTRUCTIVE_ROLLBACK = '1';
    const knex = recording_knex();

    try {
        await BASELINE.down(knex);
    } finally {
        delete process.env.ALLOW_DESTRUCTIVE_ROLLBACK;
    }

    /* it created no tables on a restored dump, so it drops none */
    assert.deepEqual(knex.used, []);
});
