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
 * Shared htmx wiring (CSP self-only forbids inline scripts).
 */

(function () {

    /*
     * htmx refuses to swap 4xx responses by default; our fragment endpoints
     * answer validation failures with error fragments meant for the target.
     * The add-user form is special-cased into its message slot so a rejected
     * submit doesn't wipe the form.
     *
     * 401 and 403 are the exception: those come from the auth middleware,
     * which drives them with response headers (HX-Redirect, HX-Reswap none)
     * and sends no body. Forcing a swap on them used to put the full-page
     * error template inside a table row, and raced the login redirect.
     */
    document.body.addEventListener('htmx:beforeSwap', function (event) {

        const status = event.detail.xhr.status;

        if (status < 400 || status >= 500 || status === 401 || status === 403) {
            return;
        }

        event.detail.shouldSwap = true;
        event.detail.isError = false;
    });

    /* sidebar icon-rail tooltips (Bootstrap; same treatment as repov2) */
    document.addEventListener('DOMContentLoaded', function () {

        if (window.bootstrap === undefined) {
            return;
        }

        document.querySelectorAll('.app-sidebar a[title], .app-header .header-actions a[title]').forEach(function (el) {
            new window.bootstrap.Tooltip(el, {
                placement: el.closest('.app-sidebar') !== null ? 'right' : 'bottom',
                delay: {show: 100, hide: 0},
                customClass: 'sidebar-tooltip'
            });
        });
    });

    /*
     * Inline-editor focus management (WCAG 2.4.3): when Save/Cancel swaps the
     * editor back to a display row, return focus to that row's Edit button
     * instead of letting it fall to <body>. Buttons opt in via
     * data-refocus="edit"; the row is re-found by id because outerHTML swaps
     * detach the element the request came from.
     */
    document.body.addEventListener('htmx:afterSettle', function (event) {

        const source = event.detail.requestConfig ? event.detail.requestConfig.elt : null;

        if (source === null || typeof source.getAttribute !== 'function' || source.getAttribute('data-refocus') !== 'edit') {
            return;
        }

        const old_row = source.closest('tr');

        if (old_row === null || old_row.id === '') {
            return;
        }

        const row = document.getElementById(old_row.id);

        if (row === null) {
            return;
        }

        /*
         * actions live in a kebab menu now - focus its toggle (falls back to
         * the first button for rows without one, e.g. future layouts)
         */
        const target = row.querySelector('.kebab-btn') || row.querySelector('button');

        if (target !== null) {
            target.focus();
        }
    });

    /*
     * Announce bookshelf search/sort/page results (WCAG 4.1.3): the table
     * fragment swaps silently, so copy its result count into the persistent
     * visually-hidden live region on the page.
     */
    document.body.addEventListener('htmx:afterSwap', function (event) {

        if (event.detail.target === null || event.detail.target.id !== 'bookshelf-table') {
            return;
        }

        const status = document.getElementById('search-status');
        const count = document.getElementById('bookshelf-count');

        if (status !== null && count !== null) {
            status.textContent = count.textContent.trim();
        }
    });

    /*
     * Copy-to-clipboard for cataloged PDF URLs (v1 parity). Buttons carry
     * data-copy-url (a root-relative path - the copied link uses the origin
     * staff are browsing, so dev copies dev and prod copies prod). Delegated
     * so it survives htmx row swaps.
     *
     * Feedback is twofold (WCAG): the button label changes to "Copied" for a
     * few seconds (visible, not color-only), and the #copy-status live region
     * announces the outcome for screen readers.
     */
    function fallback_copy(text) {

        const scratch = document.createElement('textarea');
        scratch.value = text;
        scratch.setAttribute('readonly', '');
        scratch.style.position = 'fixed';
        scratch.style.left = '-9999px';
        document.body.appendChild(scratch);
        scratch.select();

        let copied = false;

        try {
            copied = document.execCommand('copy');
        } catch {
            copied = false;
        }

        scratch.remove();
        return copied;
    }

    /*
     * Transient feedback used by copy-to-clipboard and by refused actions.
     * The kebab menu closes on click, so there is nowhere inline to put a
     * message. The toast is aria-hidden and announce() carries the
     * screen-reader half, so nothing is spoken twice.
     */
    let toast_timer = null;

    function show_toast(text) {

        let toast = document.getElementById('copy-toast');

        if (toast === null) {
            toast = document.createElement('div');
            toast.id = 'copy-toast';
            toast.className = 'copy-toast';
            toast.setAttribute('aria-hidden', 'true');
            document.body.appendChild(toast);
        }

        toast.textContent = text;
        toast.classList.add('is-visible');
        clearTimeout(toast_timer);
        toast_timer = setTimeout(function () {
            toast.classList.remove('is-visible');
        }, 3000);
    }

    /*
     * pages that carry their own live region reuse it; the rest get one made
     * on demand, so an announcement is never silently dropped
     */
    function announce(text) {

        let region = document.getElementById('copy-status');

        if (region === null) {

            region = document.getElementById('app-status');

            if (region === null) {
                region = document.createElement('div');
                region.id = 'app-status';
                region.className = 'visually-hidden';
                region.setAttribute('aria-live', 'polite');
                document.body.appendChild(region);
            }
        }

        region.textContent = text;
    }

    /*
     * The auth middleware refuses an htmx action with headers and no body, so
     * nothing swaps. Without this the click would appear to do nothing at all.
     */
    document.body.addEventListener('bookshelf:denied', function (event) {

        const message = (event.detail && event.detail.message)
            ? event.detail.message
            : 'You do not have permission to do that.';

        show_toast(message);
        announce(message);
    });

    document.body.addEventListener('click', function (event) {

        const button = event.target.closest ? event.target.closest('[data-copy-url]') : null;

        if (button === null) {
            return;
        }

        const url = window.location.origin + button.getAttribute('data-copy-url');
        const name = button.getAttribute('data-copy-name') || 'PDF';

        function report(ok) {

            const message = ok
                ? `URL for ${name} copied to clipboard: ${url}`
                : `Could not copy the URL for ${name}. The URL is ${url}`;

            announce(message);
            show_toast(message);
        }

        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(url).then(
                function () { report(true); },
                function () { report(fallback_copy(url)); }
            );
        } else {
            report(fallback_copy(url));
        }
    });

    /* server fires this header trigger after a successful user save */
    document.body.addEventListener('user-saved', function () {

        const form = document.getElementById('add-user-form');
        const message = document.getElementById('add-user-message');

        if (form !== null) {
            form.reset();
        }

        if (message !== null) {
            message.innerHTML = '';
        }
    });

}());
