'use strict';

/*
 * public/assets/js/browser-support.js fills in the newest built-ins pdf.js
 * calls. Run here in a context that lacks them, as an older browser does.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const FS = require('node:fs');
const PATH = require('node:path');
const VM = require('node:vm');

const SOURCE = FS.readFileSync(PATH.join(__dirname, '../../public/assets/js/browser-support.js'), 'utf8');

/**
 * A fresh global with the listed built-ins removed, after the script has run
 * @param removals (context) => void
 */
function older_browser(removals) {

    const context = VM.createContext({atob: atob, btoa: btoa});

    removals(context);
    VM.runInContext(SOURCE, context);

    return context;
}

const STRIP_ALL = (c) => {
    VM.runInContext('delete Map.prototype.getOrInsertComputed; delete Map.prototype.getOrInsert; delete WeakMap.prototype.getOrInsertComputed; delete WeakMap.prototype.getOrInsert; delete Promise.try; delete RegExp.escape; delete Uint8Array.fromBase64; delete Uint8Array.prototype.toBase64; delete Uint8Array.fromHex; delete Uint8Array.prototype.toHex; delete Math.sumPrecise;', c);
};

test('Math.sumPrecise sums exactly what pdf.js hands it, and compensates where a plain sum would not', () => {

    const c = older_browser(STRIP_ALL);

    /* pdf.js sums glyph sizes rounded up to a multiple of four: 13, 41, 9 and 1025 become 16, 44, 12 and 1028 */
    assert.equal(VM.runInContext('Math.sumPrecise([13, 41, 9, 1025].map((n) => n + 3 & ~3))', c), 1100);
    assert.equal(VM.runInContext('Math.sumPrecise([])', c), 0);
    assert.equal(VM.runInContext('Math.sumPrecise([1e100, 1, -1e100])', c), 1);
});

test('getOrInsertComputed computes once and keeps the first value', () => {

    const c = older_browser(STRIP_ALL);
    /* serialised inside the context: values built in another realm are never reference-equal */
    const result = VM.runInContext('const m = new Map(); let calls = 0; const a = m.getOrInsertComputed("k", () => { calls += 1; return []; }); a.push(1); const b = m.getOrInsertComputed("k", () => { calls += 1; return []; }); JSON.stringify([calls, b, m.getOrInsert("k", "x"), m.getOrInsert("other", "y")])', c);

    assert.equal(result, JSON.stringify([1, [1], [1], 'y']));
    assert.equal(VM.runInContext('typeof new WeakMap().getOrInsertComputed', c), 'function');
});

test('a method the browser already has is left alone', () => {

    /* stands in for the native one, which this Node may not have either */
    const c = older_browser((context) => {
        VM.runInContext('Map.prototype.getOrInsertComputed = function native_stand_in() {}; RegExp.escape = function native_stand_in() {};', context);
    });

    assert.equal(VM.runInContext('Map.prototype.getOrInsertComputed.name', c), 'native_stand_in');
    assert.equal(VM.runInContext('RegExp.escape.name', c), 'native_stand_in');
});

test('Promise.try turns a synchronous throw into a rejection and passes arguments through', async () => {

    const c = older_browser(STRIP_ALL);

    assert.equal(await VM.runInContext('Promise.try((a, b) => a + b, 2, 3)', c), 5);
    await assert.rejects(VM.runInContext('Promise.try(() => { throw new Error("sync"); })', c), /sync/);
});

test('RegExp.escape makes any text match itself literally', () => {

    const c = older_browser(STRIP_ALL);

    for (const text of ['a.b*c', '1+1=2 (really)', '[x]|{y}\\z', 'du_mrp-2026', 'tab\there']) {
        const escaped = VM.runInContext('RegExp.escape(' + JSON.stringify(text) + ')', c);
        assert.ok(new RegExp('^' + escaped + '$').test(text), text);
    }

    /* the wildcard is escaped, so it no longer matches everything */
    assert.equal(new RegExp(VM.runInContext('RegExp.escape("a.c")', c)).test('abc'), false);
    /* a leading digit cannot fuse with a preceding escape */
    assert.match(VM.runInContext('RegExp.escape("1st")', c), /^\\x31/);
});

test('the base64 and hex methods round-trip bytes', () => {

    const c = older_browser(STRIP_ALL);

    assert.equal(VM.runInContext('JSON.stringify([Array.from(Uint8Array.fromBase64("AAECAwT/")), new Uint8Array([0, 1, 2, 3, 4, 255]).toBase64()])', c), JSON.stringify([[0, 1, 2, 3, 4, 255], 'AAECAwT/']));
    assert.equal(VM.runInContext('JSON.stringify([Array.from(Uint8Array.fromHex("00ff10ab")), new Uint8Array([0, 255, 16, 171]).toHex()])', c), JSON.stringify([[0, 255, 16, 171], '00ff10ab']));
});
