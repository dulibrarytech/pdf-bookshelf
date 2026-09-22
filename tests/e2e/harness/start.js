'use strict';

/*
 * The server Playwright starts (playwright.config.js, webServer). Builds the
 * e2e environment from nothing and then boots the app in this process:
 *   1. drop and recreate the e2e database, run the migrations
 *   2. seed the users and the PDF records
 *   3. empty the e2e storage directory and write the seeded PDFs into it
 *   4. start the stub identity provider on its own port
 *   5. require the app's entrypoint, which binds the port
 * Run by hand it does the same: node tests/e2e/harness/start.js
 */

const FS = require('node:fs');
const PATH = require('node:path');
const CRYPTO = require('node:crypto');

const ENV = require('./env');
ENV.apply();

const DB = require('./db');
const IDP = require('./idp');
const SEED = require('./seed');
const { pdf_bytes } = require('./pdf');

async function prepare() {

    await DB.recreate();

    const db = DB.connect();

    try {
        await db.migrate.latest();
        await db('tbl_users').insert([SEED.USERS.ADMIN, SEED.USERS.STAFF]);

        FS.rmSync(ENV.VALUES.STORAGE_PATH, {recursive: true, force: true});
        FS.mkdirSync(ENV.VALUES.STORAGE_PATH, {recursive: true});

        for (const pdf of SEED.PDFS) {

            const bytes = pdf_bytes(pdf.title);

            FS.writeFileSync(PATH.join(ENV.VALUES.STORAGE_PATH, `${pdf.filename}.pdf`), bytes);

            await db('tbl_pdfs').insert({
                uuid: pdf.uuid,
                filename: pdf.filename,
                title: pdf.title,
                file_size: bytes.length,
                sha256: CRYPTO.createHash('sha256').update(bytes).digest('hex'),
                hits: pdf.hits,
                is_active: 1
            });
        }
    } finally {
        await db.destroy();
    }

    await IDP.start(ENV.IDP_PORT);
}

prepare().then(function () {
    require(PATH.join(ENV.ROOT, 'pdf-bookshelf.js'));
}, function (error) {
    console.error(`e2e harness: could not prepare the environment - ${error.message}`);
    process.exit(1);
});
