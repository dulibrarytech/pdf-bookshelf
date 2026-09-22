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
 * Points the vendored pdf.js viewer at this app: which document to open, and
 * where its worker/font/cmap/wasm assets live (the viewer resolves them
 * relative to the page, which is APP_PATH/viewer, not the bundle's folder).
 *
 * Set through `webviewerloaded`, the viewer's documented pre-configuration
 * hook: it fires after viewer.mjs has published PDFViewerApplicationOptions
 * on window and before PDFViewerApplication.run() reads any of it, so the
 * bundle in public/libs/pdfjs stays byte-for-byte upstream. Values come from
 * data attributes the server renders onto <html>, so nothing needs an inline
 * script (the CSP is script-src 'self').
 *
 * Load order matters: this file is a deferred classic script placed BEFORE
 * viewer.mjs in views/viewer.ejs. Deferred and module scripts both run in
 * document order after parsing, so the listener is always registered first.
 *
 * annotationEditorMode and enableSignatureEditor are options of kind
 * PREFERENCE, which a stored pdfjs.preferences entry in localStorage is
 * applied over after this hook has run; disablePreferences closes that door.
 * Per-document zoom, sidebar and scroll memory is ViewHistory, a separate
 * store, and is unaffected.
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
         * The bundle's version keys the two files loaded by URL from here, as
         * it keys the page's own script tags. The directory URLs below get NO
         * query string: pdf.js appends file names to those.
         */
        const bust = data.pdfjsV ? '?v=' + encodeURIComponent(data.pdfjsV) : '';

        const settings = {
            /*
             * Take the download affordance out of the viewer: pdf.js hides
             * the toolbar button and the Tools-menu item and builds no
             * DownloadManager, which makes Ctrl/Cmd+S a no-op too. The PDF is
             * still served from APP_PATH/pdf/<uuid> and printing remains:
             * deterrence, not DRM.
             */
            supportsDownloading: false,

            /*
             * "Add signature" is already off in 6.3.289 (the option defaults
             * to false and the container ships hidden); set explicitly so a
             * later release flipping the default cannot put the button back.
             */
            enableSignatureEditor: false,

            /*
             * Turn off annotation editing entirely - Highlight, Text, Draw,
             * stamp and the rest: the viewer hides the whole #editorModeButtons
             * group. The EDITOR only: `annotationMode`, which governs whether
             * a document's own annotations, links and forms render, keeps its
             * default, and text selection is unaffected.
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
         * A session that expires while the viewer is open surfaces as a 401
         * on the next request for the document: the sign-in redirect ends at
         * another origin, which a fetch() cannot follow, and pdf.js reports
         * that poorly. pdf.js fetches the document - whole, or in ranges -
         * through window.fetch, so a 401 for this document means the session
         * is gone, and the page sends itself through sign-in and back here.
         * Any other answer is left for pdf.js to handle.
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
