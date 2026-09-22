'use strict';

/*
 * The viewer page and its config script must key every pdf.js file they load
 * to the bundle's version (?v=), and must NOT put a query string on the
 * directory URLs pdf.js appends file names to. views/viewer.ejs is
 * regenerated from the upstream viewer.html on every upgrade, which is
 * exactly when the keys would silently go missing - hence the test.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const FS = require('node:fs');
const PATH = require('node:path');
const VM = require('node:vm');
const EJS = require('ejs');

const ROOT = PATH.join(__dirname, '../..');

test('the viewer page keys the bundle\'s script and stylesheet URLs to its version', async () => {

    const html = await EJS.renderFile(PATH.join(ROOT, 'views/viewer.ejs'), {
        app_path: '/b', appname: 'App', title: 'Doc', uuid: 'u-1', asset_v: 'A', pdfjs_v: 'V9'
    });

    for (const url of ['/b/static/libs/pdfjs/build/pdf.mjs?v=V9', '/b/static/libs/pdfjs/web/viewer.mjs?v=V9', '/b/static/libs/pdfjs/web/viewer.css?v=V9']) {
        assert.ok(html.includes(`"${url}"`), `expected ${url}`);
    }

    /* the config script reads these; the base is a directory and must stay clean */
    assert.match(html, /data-pdfjs-base="\/b\/static\/libs\/pdfjs"/);
    assert.match(html, /data-pdfjs-v="V9"/);
    assert.match(html, /data-pdf-url="\/b\/pdf\/u-1"/);
    /* where the page sends itself when its session has expired */
    assert.match(html, /data-login-url="\/b\/login"/);
    /* where the worker shim and the app's asset key come from */
    assert.match(html, /data-assets-base="\/b\/static\/assets"/);
    assert.match(html, /data-asset-v="A"/);

    /* the browser-support shims run before the bundle: deferred and module scripts execute in document order */
    const support_at = html.indexOf('/b/static/assets/js/browser-support.js?v=A');
    assert.ok(support_at > -1, 'browser-support.js is loaded');
    assert.ok(support_at < html.indexOf('/b/static/libs/pdfjs/build/pdf.mjs?v=V9'), 'and before pdf.mjs');

    /* no pdf.js file is loaded without the key, apart from the locale index the l10n loader resolves paths against */
    const unkeyed = [...html.matchAll(/\/static\/libs\/pdfjs\/[^"?]+"/g)].map((m) => m[0]).filter((u) => !/locale\.json"$/.test(u) && !/libs\/pdfjs"$/.test(u));
    assert.deepEqual(unkeyed, []);
});

/**
 * Runs public/assets/js/pdf-viewer-config.js against a stand-in document and
 * fires the hook it listens for. Returns what it set on the viewer, the
 * page's fetch as the script left it, the answers the underlying fetch was
 * told to give, and the navigations the script asked for.
 * @param dataset the <html> data attributes
 * @param answers url substring -> status the underlying fetch answers with
 */
function run_config_script(dataset, answers = {}) {

    const handlers = {};
    const store = new Map();
    const assigned = [];
    const original_fetch = async (input) => {
        const url = typeof input === 'string' ? input : (input.url || input.href);
        const match = Object.keys(answers).find((part) => url.includes(part));
        return {status: match === undefined ? 200 : answers[match], url: url};
    };

    const context = {
        document: {
            addEventListener: (name, handler) => { handlers[name] = handler; },
            documentElement: {dataset: dataset}
        },
        window: {
            PDFViewerApplicationOptions: {set: (name, value) => store.set(name, value), get: (name) => store.get(name)},
            fetch: original_fetch,
            location: {href: 'http://x/b/viewer?pdf=u-1', pathname: '/b/viewer', search: '?pdf=u-1', assign: (url) => assigned.push(url)}
        },
        console: {error: (message) => { throw new Error(message); }},
        encodeURIComponent: encodeURIComponent,
        URL: URL
    };

    VM.runInNewContext(FS.readFileSync(PATH.join(ROOT, 'public/assets/js/pdf-viewer-config.js'), 'utf8'), context);
    handlers.webviewerloaded();

    /* the wrapper reacts to an answer through a promise */
    const settle = () => new Promise((resolve) => setImmediate(resolve));

    return {options: store, fetch: context.window.fetch, original_fetch, assigned, settle};
}

function options_set_by_config_script(dataset) {
    return run_config_script(dataset).options;
}

test('the config script keys the worker and sandbox to the version, and leaves directory URLs clean', () => {

    const options = options_set_by_config_script({pdfjsBase: '/b/static/libs/pdfjs/', pdfjsV: '6.3.289', pdfUrl: '/b/pdf/u-1'});

    assert.equal(options.get('workerSrc'), '/b/static/libs/pdfjs/build/pdf.worker.mjs?v=6.3.289');
    assert.equal(options.get('sandboxBundleSrc'), '/b/static/libs/pdfjs/build/pdf.sandbox.mjs?v=6.3.289');
    assert.equal(options.get('defaultUrl'), '/b/pdf/u-1');

    /* pdf.js appends file names to these, so a query string here would break every fetch */
    for (const name of ['cMapUrl', 'iccUrl', 'standardFontDataUrl', 'wasmUrl']) {
        assert.match(options.get(name), /^\/b\/static\/libs\/pdfjs\/web\/[a-z_]+\/$/, `${name} = ${options.get(name)}`);
    }

    /* and the viewer policy is untouched */
    assert.equal(options.get('supportsDownloading'), false);
    assert.equal(options.get('annotationEditorMode'), -1);
    assert.equal(options.get('enableSignatureEditor'), false);
    /* a stored pdfjs.preferences entry must not be applied over the two PREFERENCE-kind settings */
    assert.equal(options.get('disablePreferences'), true);
});

test('without a version attribute the config script loads the files unkeyed rather than failing', () => {

    const options = options_set_by_config_script({pdfjsBase: '/b/static/libs/pdfjs', pdfUrl: '/b/pdf/u-1'});

    assert.equal(options.get('workerSrc'), '/b/static/libs/pdfjs/build/pdf.worker.mjs');
});

/* --- an expired session while the viewer is open --- */

const DATASET = {pdfjsBase: '/b/static/libs/pdfjs', pdfjsV: '6.3.289', pdfUrl: '/b/pdf/u-1', loginUrl: '/b/login'};
const DOCUMENT = 'http://x/b/pdf/u-1';

test('a 401 for this document - the load, or a range read later - sends the page through sign-in and back', async () => {

    /*
     * pdf.js fetches the document through window.fetch, whole or in ranges;
     * the wrapper watches the answers, so a range read failing mid-document
     * is caught too - pdf.js itself reports that one only in the console
     */
    const run = run_config_script(DATASET, {'/b/pdf/u-1': 401});

    const response = await run.fetch(DOCUMENT, {headers: {Range: 'bytes=12000000-12011247'}});
    assert.equal(response.status, 401, 'the answer still reaches pdf.js');
    await run.settle();

    assert.deepEqual(run.assigned, ['/b/login?next=%2Fb%2Fviewer%3Fpdf%3Du-1']);

    /* one bounce, however many requests were in flight */
    await run.fetch(DOCUMENT);
    await run.settle();
    assert.equal(run.assigned.length, 1);
});

test('any other answer, and any other URL, is left to pdf.js', async () => {

    const run = run_config_script(DATASET, {'/b/pdf/u-1': 200, '/b/static/': 401});

    await run.fetch(DOCUMENT);
    await run.fetch('http://x/b/static/libs/pdfjs/web/cmaps/Adobe-Japan1-UCS2.bcmap');
    await run.fetch(new URL('http://x/b/static/other'));
    await run.settle();

    assert.deepEqual(run.assigned, []);

    /* a URL object naming the document is recognised too */
    const by_url = run_config_script(DATASET, {'/b/pdf/u-1': 401});
    await by_url.fetch(new URL(DOCUMENT));
    await by_url.settle();
    assert.equal(by_url.assigned.length, 1);
});

test('without a login url the page\'s fetch is left untouched', async () => {

    const run = run_config_script({pdfjsBase: '/b/static/libs/pdfjs', pdfUrl: '/b/pdf/u-1'}, {'/b/pdf/u-1': 401});

    assert.equal(run.fetch, run.original_fetch);
    assert.equal(run.options.get('workerSrc'), '/b/static/libs/pdfjs/build/pdf.worker.mjs');
});

test('with an assets base the worker starts through the shim, keyed to both the bundle and the app', () => {

    const options = options_set_by_config_script({
        pdfjsBase: '/b/static/libs/pdfjs/', pdfjsV: '6.3.289', pdfUrl: '/b/pdf/u-1', loginUrl: '/b/login',
        assetsBase: '/b/static/assets/', assetV: 'A1'
    });

    assert.equal(options.get('workerSrc'), '/b/static/assets/js/pdf-worker.mjs?v=6.3.289&a=A1');
    /* the sandbox runs on the main thread, where the page's own shims apply */
    assert.equal(options.get('sandboxBundleSrc'), '/b/static/libs/pdfjs/build/pdf.sandbox.mjs?v=6.3.289');
});

test('the worker shim forwards each key to the import it belongs to', () => {

    const source = FS.readFileSync(PATH.join(ROOT, 'public/assets/js/pdf-worker.mjs'), 'utf8');

    /* the shims first, then the bundle's worker; each import keyed by its own parameter */
    assert.match(source, /await import\(keyed\('\.\/browser-support\.js', 'a'\)\);\s*const worker = await import\(keyed\('\.\.\/\.\.\/libs\/pdfjs\/build\/pdf\.worker\.mjs', 'v'\)\);/);
    /* pdf.js's main-thread fallback imports this file and reads the handler off it */
    assert.match(source, /export const WorkerMessageHandler = worker\.WorkerMessageHandler;/);
});
