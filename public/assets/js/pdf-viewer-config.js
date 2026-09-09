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
 * pdf.js logs "The Preferences may override manually set AppOptions" on every
 * load. It is advisory and fires whenever anything has been set at all - it
 * does not mean a collision happened. Preferences can only reach options of
 * kind PREFERENCE, and none of the seven below are; all seven were verified to
 * still hold these values after preferences are applied. Silencing it means
 * setting disablePreferences, which would also stop the viewer remembering the
 * reader's zoom and sidebar choices - not worth it for a cosmetic warning.
 */

(function () {

    document.addEventListener('webviewerloaded', function () {

        const options = window.PDFViewerApplicationOptions;
        const data = document.documentElement.dataset;

        if (options === undefined || data.pdfjsBase === undefined) {
            return;
        }

        const base = data.pdfjsBase.replace(/\/+$/, '');

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
             * the document this page was rendered for; the server already
             * resolved it to a uuid, so legacy filename links land directly
             * on the canonical delivery URL instead of via a redirect
             */
            defaultUrl: data.pdfUrl || '',
            workerSrc: base + '/build/pdf.worker.mjs',
            sandboxBundleSrc: base + '/build/pdf.sandbox.mjs',
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
    });

}());
