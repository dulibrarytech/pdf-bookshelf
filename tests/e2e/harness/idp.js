'use strict';

/*
 * A stand-in for DU's identity proxy, on its own port. The app sends people
 * to /sso?app_url=<callback>; the page shows that callback and a form that
 * posts employeeID to it, query intact - the legacy proxy's convention -
 * with whatever DU ID the test types. /logout is where SSO_LOGOUT_URL
 * points. A real server rather than an intercepted origin, because
 * Playwright does not route the requests a redirect leads to, and every
 * visit here arrives by one.
 */

const HTTP = require('node:http');

function escape_html(text) {
    return String(text).replace(/[&<>"']/g, (c) => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
}

function document(body) {
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>IdP stub</title></head><body>${body}</body></html>`;
}

/**
 * @param port
 * @returns {Promise<HTTP.Server>} listening
 */
exports.start = function (port) {

    const server = HTTP.createServer(function (req, res) {

        const url = new URL(req.url, `http://localhost:${port}`);

        res.setHeader('content-type', 'text/html; charset=utf-8');

        if (url.pathname === '/logout') {
            res.end(document('<h1>Signed out at the identity provider</h1>'));
            return;
        }

        if (url.pathname === '/sso') {

            const app_url = escape_html(url.searchParams.get('app_url') || '');

            res.end(document(`<h1>Identity provider stub</h1>
                <p>Callback: <code id="app-url">${app_url}</code></p>
                <form method="post" action="${app_url}">
                    <label>DU ID <input name="employeeID" value=""></label>
                    <button type="submit">Continue</button>
                </form>`));
            return;
        }

        res.statusCode = 404;
        res.end(document('<h1>Not found</h1>'));
    });

    return new Promise(function (resolve, reject) {
        server.once('error', reject);
        server.listen(port, 'localhost', () => resolve(server));
    });
};
