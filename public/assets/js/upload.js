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
 * Drag-and-drop upload (v1 parity, minus the Dropzone dependency - CSP
 * self-only). The dropzone feeds the hidden <input type=file> that the
 * HTMX multipart form posts; byte-level progress rides htmx:xhr:progress.
 */

(function () {

    const MAX_FILES = 10;

    const dropzone = document.getElementById('dropzone');
    const input = document.getElementById('pdfs');
    const list = document.getElementById('upload-file-list');
    const error = document.getElementById('upload-file-error');
    const submit = document.getElementById('upload-submit');

    /* selection state lives here; the input is refreshed from it */
    let selected = [];

    function format_size(bytes) {

        if (!Number.isFinite(bytes) || bytes <= 0) {
            return '0 B';
        }

        const units = ['B', 'KB', 'MB', 'GB'];
        const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
        const value = bytes / Math.pow(1024, exponent);
        return (exponent === 0 ? value : value.toFixed(1)) + ' ' + units[exponent];
    }

    function show_error(message) {
        error.textContent = message;
        error.classList.toggle('d-none', message === '');
    }

    function sync() {

        /* rebuild the input's FileList from the selection */
        const transfer = new DataTransfer();
        selected.forEach((file) => transfer.items.add(file));
        input.files = transfer.files;

        /* render the file list */
        list.innerHTML = '';
        list.classList.toggle('d-none', selected.length === 0);
        submit.disabled = selected.length === 0;

        selected.forEach(function (file, index) {

            const item = document.createElement('li');
            item.className = 'list-group-item d-flex align-items-center justify-content-between gap-3';

            const label = document.createElement('div');
            label.className = 'text-truncate';
            label.textContent = file.name;

            const meta = document.createElement('div');
            meta.className = 'd-flex align-items-center gap-2 flex-shrink-0';

            const size = document.createElement('span');
            size.className = 'text-body-secondary small';
            size.textContent = format_size(file.size);

            const remove = document.createElement('button');
            remove.type = 'button';
            remove.className = 'btn btn-sm btn-outline-secondary';
            remove.textContent = 'Remove';
            remove.setAttribute('aria-label', 'Remove ' + file.name);
            remove.addEventListener('click', function () {
                selected.splice(index, 1);
                show_error('');
                sync();
            });

            meta.appendChild(size);
            meta.appendChild(remove);
            item.appendChild(label);
            item.appendChild(meta);
            list.appendChild(item);
        });
    }

    function add_files(files) {

        show_error('');
        const rejected = [];

        for (const file of files) {

            if (!/\.pdf$/i.test(file.name)) {
                rejected.push(file.name);
                continue;
            }

            /* dedupe by name+size */
            if (selected.some((f) => f.name === file.name && f.size === file.size)) {
                continue;
            }

            selected.push(file);
        }

        const messages = [];

        if (selected.length > MAX_FILES) {
            selected = selected.slice(0, MAX_FILES);
            messages.push('Only the first ' + MAX_FILES + ' files were kept (' + MAX_FILES + '-file limit per upload).');
        }

        if (rejected.length > 0) {
            messages.push('Skipped (not PDF): ' + rejected.join(', '));
        }

        show_error(messages.join(' '));
        sync();
    }

    if (dropzone !== null && input !== null) {

        dropzone.addEventListener('click', () => input.click());

        dropzone.addEventListener('keydown', function (event) {

            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                input.click();
            }
        });

        input.addEventListener('change', function () {
            add_files(input.files);
        });

        ['dragenter', 'dragover'].forEach(function (name) {
            dropzone.addEventListener(name, function (event) {
                event.preventDefault();
                dropzone.classList.add('is-dragover');
            });
        });

        ['dragleave', 'drop'].forEach(function (name) {
            dropzone.addEventListener(name, function (event) {
                event.preventDefault();
                dropzone.classList.remove('is-dragover');
            });
        });

        dropzone.addEventListener('drop', function (event) {

            if (event.dataTransfer && event.dataTransfer.files.length > 0) {
                add_files(event.dataTransfer.files);
            }
        });

        /* after a completed upload, htmx swaps in the results - reset the form */
        document.body.addEventListener('htmx:afterRequest', function (event) {

            if (event.detail.elt && event.detail.elt.id === 'upload-form' && event.detail.successful) {
                selected = [];
                show_error('');
                sync();
            }
        });
    }

    /* byte-level progress on the Bootstrap bar (width + aria-valuenow) */
    document.body.addEventListener('htmx:xhr:progress', function (event) {

        const bar = document.getElementById('upload-progress-bar');

        if (bar === null || !event.detail.lengthComputable) {
            return;
        }

        const percent = Math.round((event.detail.loaded / event.detail.total) * 100);
        bar.style.width = percent + '%';
        bar.setAttribute('aria-valuenow', String(percent));
    });

    document.body.addEventListener('htmx:afterRequest', function () {

        const bar = document.getElementById('upload-progress-bar');

        if (bar !== null) {
            bar.style.width = '0%';
            bar.setAttribute('aria-valuenow', '0');
        }
    });

}());
