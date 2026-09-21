'use strict';

/*
 * The two checks that decide what a staff upload is allowed to become on disk.
 * sanitize_filename produces the storage key; is_pdf is the content check that
 * a renamed file cannot talk its way past.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const FS = require('node:fs');
const PATH = require('node:path');
const OS = require('node:os');
const CONTROLLER = require('../../uploads/controller');

const sanitize = CONTROLLER._sanitize_filename;
const is_pdf = CONTROLLER._is_pdf;
const filename_problem = CONTROLLER._filename_problem;
const derive_title = CONTROLLER._derive_title;
const result_message = CONTROLLER._result_message;

test('a traversal attempt cannot escape the storage directory', () => {

    /*
     * The property that matters is where the file would land, not how the key
     * looks: a backslash name on POSIX sanitises to "..-..-windows-system32",
     * which keeps its dots but carries no separator, so it is an ordinary
     * filename inside storage. Assert the destination, not the spelling.
     */
    const storage = PATH.resolve('./storage');

    for (const name of ['../../etc/passwd.pdf', '..\\..\\windows\\system32.pdf', '/etc/shadow.pdf', '..', '.']) {

        const result = sanitize(name);
        const destination = PATH.join(storage, result + '.pdf');

        assert.ok(destination.startsWith(storage + PATH.sep), `${name} -> ${destination}`);
        assert.ok(!result.includes('/') && !result.includes('\\'), `${name} -> ${result} kept a separator`);
    }
});

test('the storage key is lowercased, despaced and stripped of its extension', () => {
    assert.equal(sanitize('Annual Report 2026.pdf'), 'annualreport2026');
    assert.equal(sanitize('MiXeD.PDF'), 'mixed');
    assert.equal(sanitize('no-extension'), 'no-extension');
});

test('characters that are illegal in a filename become dashes', () => {
    assert.equal(sanitize('a?b%c*d:e|f"g<h>i.pdf'), 'a-b-c-d-e-f-g-h-i');
});

test('only a trailing .pdf is stripped, not one inside the name', () => {
    /* "report.pdf.pdf" must not collapse past its real name */
    assert.equal(sanitize('report.pdf.pdf'), 'report.pdf');
    assert.equal(sanitize('v1.pdf.backup.pdf'), 'v1.pdf.backup');
});

test('a name that sanitises to nothing is caught by the caller', () => {
    /* the controller rejects an empty result rather than writing ".pdf" */
    assert.equal(sanitize('.pdf'), '');
    assert.equal(sanitize('   .pdf'), '');
});

async function file_with(bytes) {
    const dir = FS.mkdtempSync(PATH.join(OS.tmpdir(), 'bookshelf-upload-'));
    const path = PATH.join(dir, 'candidate');
    FS.writeFileSync(path, bytes);
    return path;
}

test('is_pdf reads the magic bytes, not the name', async () => {

    assert.equal(await is_pdf(await file_with('%PDF-1.7\nreal\n%%EOF')), true);

    /* the whole point: a renamed executable claiming to be a PDF */
    assert.equal(await is_pdf(await file_with('MZ\x90\x00executable')), false);
    assert.equal(await is_pdf(await file_with('<html>not a pdf</html>')), false);
});

test('is_pdf handles a file shorter than the signature', async () => {
    /* a 3-byte file must answer false, not throw or read past the end */
    assert.equal(await is_pdf(await file_with('%PD')), false);
    assert.equal(await is_pdf(await file_with('')), false);
});

/* --- length limits, measured the way the filesystem and the column do --- */

test('the storage key is limited in bytes, as a filesystem is, not in characters', () => {

    /* 251 + ".pdf" = 255 bytes, the most a name may be */
    assert.equal(filename_problem('a'.repeat(251)), null);
    assert.match(filename_problem('a'.repeat(252)), /too long: 256 bytes/);

    /*
     * the regression: 130 accented characters is 260 bytes of UTF-8 - well
     * under the old 250-character check, and ENAMETOOLONG on Linux
     */
    assert.match(filename_problem('\u00e9'.repeat(130)), /too long: 264 bytes/);
    assert.equal(filename_problem('\u00e9'.repeat(125)), null);

    assert.equal(filename_problem(''), 'Invalid filename.');
});

test('the title is the original name trimmed and capped to the column, as the editor would leave it', () => {

    assert.equal(derive_title('Annual Report 2026.pdf', 'annualreport2026'), 'Annual Report 2026');
    assert.equal(derive_title('  spaced  .PDF', 'spaced'), 'spaced');

    /* tbl_pdfs.title is VARCHAR(500); an uncapped title failed the INSERT with a raw driver message */
    const long = derive_title('x'.repeat(600) + '.pdf', 'x');
    assert.equal(long.length, 500);

    /* nothing left after the extension and trimming - the key stands in, as re-sync does */
    assert.equal(derive_title('.pdf', 'fallback'), 'fallback');
    assert.equal(derive_title('   .pdf', 'fallback'), 'fallback');
});

test('a refusal of ours is shown as it is; a driver or filesystem failure is not', () => {

    const ours = new Error('Not a PDF file.');
    ours.status = 400;
    assert.equal(result_message(ours), 'Not a PDF file.');

    /* the raw messages name column names, paths and error codes */
    const mysql = new Error("ER_DATA_TOO_LONG: Data too long for column 'title' at row 1");
    const fs = new Error("ENAMETOOLONG: name too long, link '/srv/storage/.tmp/abc' -> '/srv/storage/very-long.pdf'");

    for (const error of [mysql, fs]) {
        assert.equal(result_message(error), 'Upload failed for this file. The server log has the details.');
    }
});
