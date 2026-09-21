/**
 * Copyright 2026 University of Denver
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

'use strict';

/*
 * Points the vendored pdf.js viewer at this app.
 *
 * Two things have to be told to the viewer: which document to open, and where
 * its own worker/font/cmap/wasm assets live. Both defaults are wrong for us -
 * the viewer resolves assets relative to the page it is served from, and this
 * page is APP_PATH/viewer, not the bundle's own folder.
 *
 * This is done through `webviewerloaded`, the viewer's documented
 * pre-configuration hook: it fires after viewer.mjs has published
 * PDFViewerApplicationOptions on window, and before PDFViewerApplication.run()
 * reads any of it. So the bundle in public/libs/pdfjs stays byte-for-byte
 * upstream and an upgrade is a re-run of scripts/vendor-pdfjs.js - the reason
 * a 2021 build with known CVEs was able to sit here for five years is that
 * v1/v2.0 hand-patched these values INTO the bundle.
 *
 * Values come from data attributes the server renders onto <html>, so nothing
 * needs an inline script (the CSP is script-src 'self').
 *
 * Load order matters: this file is a deferred classic script placed BEFORE
 * viewer.mjs in views/viewer.ejs. Deferred and module scripts both run in
 * document order after parsing, so the listener is always registered first.
 *
 * Two of the policy settings below - annotationEditorMode and
 * enableSignatureEditor - are options of kind PREFERENCE, the kind a stored
 * pdfjs.preferences entry in localStorage is applied over after this hook
 * has run. Nothing in this deployment writes that store, but
 * disablePreferences closes the door anyway, and with it silences the
 * "The Preferences may override manually set AppOptions" warning pdf.js
 * otherwise logs on every load. Per-document zoom, sidebar and scroll memory
 * is ViewHistory, a separate store (pdfjs.history), and is unaffected.
 */

(function () {

    document.addEventListener('webviewerloaded', function () {

        const options = window.PDFViewerApplicationOptions;
        const data = document.documentElement.dataset;

        if (options === undefined || data.pdfjsBase === undefined) {
            return;
        }

        const base = data.pdfjsBase.replace(/\/+$/, '');

        /*
         * The bundle's version keys the two files loaded by URL from here, so
         * an upgrade is not served from a day-old browser cache (the page's
         * own script tags carry the same key). The directory URLs below get
         * NO query string: pdf.js appends file names to those.
         */
        const bust = data.pdfjsV ? '?v=' + encodeURIComponent(data.pdfjsV) : '';

        const settings = {
            /*
             * Take the download affordance out of the viewer. This is the
             * viewer's own supported switch, so pdf.js does the work: it hides
             * both the toolbar button and the Tools-menu item, and builds no
             * DownloadManager - which makes Ctrl/Cmd+S a no-op too, since
             * downloadOrSave() returns early without one. pdf.js still
             * swallows the keystroke, so the browser's own save dialog does
             * not appear either.
             *
             * Worth being clear about what this is not: the PDF is still
             * served from APP_PATH/pdf/<uuid>, and anyone signed in can fetch
             * that URL directly. Printing also remains, and print-to-PDF is an
             * equivalent way out. This removes the obvious path, not the
             * capability - it is deterrence, not DRM.
             */
            supportsDownloading: false,

            /*
             * "Add signature". pdf.js 6.3.289 already ships this off - the
             * option defaults to false and the markup carries hidden="true" on
             * the container, which the viewer only clears when the option is
             * on - so this changes nothing today. It is set explicitly because
             * the signature editor is under active upstream development and a
             * later release flipping the default would otherwise quietly put
             * the button back.
             */
            enableSignatureEditor: false,

            /*
             * Turn off annotation editing entirely - Highlight, Text, Draw and
             * the rest. The viewer responds by hiding the whole
             * #editorModeButtons group and its separator, so this replaces the
             * per-control hiding that used to live here for the stamp editor:
             * that button sits inside the same group.
             *
             * This is the EDITOR only. `annotationMode` governs whether
             * annotations already in a PDF are rendered, and is left at its
             * default of 2 - links, forms and existing markup in a purchased
             * document still display and still work. Text selection is not an
             * editor feature either and is unaffected.
             */
            annotationEditorMode: -1,

            /*
             * Keep a stored pdfjs.preferences entry from overriding the two
             * PREFERENCE-kind settings above - see the file header. This is
             * the viewer's own switch; it does not touch ViewHistory.
             */
            disablePreferences: true,

            /*
             * the document this page was rendered for; the server already
             * resolved it to a uuid, so legacy filename links land directly
             * on the canonical delivery URL instead of via a redirect
             */
            defaultUrl: data.pdfUrl || '',
            workerSrc: base + '/build/pdf.worker.mjs' + bust,
            sandboxBundleSrc: base + '/build/pdf.sandbox.mjs' + bust,
            cMapUrl: base + '/web/cmaps/',
            iccUrl: base + '/web/iccs/',
            standardFontDataUrl: base + '/web/standard_fonts/',
            wasmUrl: base + '/web/wasm/'
        };

        for (const name of Object.keys(settings)) {

            options.set(name, settings[name]);

            /*
             * AppOptions.setAll silently ignores names it does not know, so an
             * option renamed upstream would fail as a mystery 404 for the
             * worker or blank glyphs. Read back and say so instead.
             */
            if (options.get(name) !== settings[name]) {
                console.error(`pdf-viewer-config: pdf.js rejected the "${name}" option - check it still exists in this pdf.js release.`);
            }
        }

        /*
         * A session that expires while the viewer is open - a tab left
         * overnight, a long document read past the twelve-hour mark - now
         * surfaces as a plain 401 on the next request for the document,
         * because the sign-in redirect is one a fetch() cannot follow (it
         * ends at the identity provider, another origin). pdf.js reports that
         * poorly: an "unexpected server response" dialog for a document load,
         * and for a range read mid-document nothing but a console line, with
         * the page left blank. So watch the answers instead of the symptoms.
         * pdf.js fetches the document - the whole of it, or ranges of it on
         * demand - through window.fetch in every supported browser; a 401 for
         * this document means the session is gone, and the page sends itself
         * through sign-in and back to this document, which is what a reload
         * does by hand. Any other answer is left for pdf.js to handle.
         */
        if (!data.loginUrl || typeof window.fetch !== 'function') {
            return;
        }

        const document_path = new URL(data.pdfUrl, window.location.href).pathname;
        const original_fetch = window.fetch;
        let bounced = false;

        function is_this_document(input) {

            /* a string, a URL (href) or a Request (url) */
            const url = typeof input === 'string' ? input : (input && (input.url || input.href)) || '';

            try {
                return new URL(url, window.location.href).pathname === document_path;
            } catch {
                return false;
            }
        }

        window.fetch = function (input) {

            const answer = original_fetch.apply(this, arguments);

            if (!bounced && is_this_document(input)) {
                answer.then(function (response) {

                    if (response.status === 401 && !bounced) {
                        bounced = true;
                        window.location.assign(data.loginUrl + '?next=' + encodeURIComponent(window.location.pathname + window.location.search));
                    }
                }, function () {
                    /* a network failure is pdf.js's to report */
                });
            }

            return answer;
        };
    });

}());
