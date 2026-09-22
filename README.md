# PDF Bookshelf v2

Makes purchased PDFs available to SSO-authenticated DU community members. 

## Local setup

```
# prerequisites: Node >= 22, MariaDB with the pdf_bookshelf database
cd pdf-bookshelf
npm install           # its postinstall hook copies Bootstrap/HTMX from node_modules into
                      # public/libs (self-hosted, CSP self-only); `npm run vendor` redoes it
cp .env-example .env  # then fill in values (the app refuses to start if a
                      # required one is missing, and names every one it needs)
npm run migrate       # applies knex migrations (safe over a database restored from the v1 dump)
npm test              # unit tests (node:test)
npm run dev           # http://localhost:8005/bookshelf/dashboard/home
```

## Tests

`npm test` runs the unit and integration suites (`node --test`; the
integration suite boots the app on an ephemeral port with the models stubbed).
`npm run test:e2e` runs the Playwright suite in a real Chromium against a real
instance: it drops and recreates a `pdf_bookshelf_e2e` database using the
credentials in `.env`, migrates and seeds it, points storage at
`tests/e2e/.storage`, starts the app on port 8006, and signs in through a stub
identity provider that the browser intercepts - nothing reaches the real one.
Run `npx playwright install chromium` once per machine first. `npm run
test:all` runs both.

## Deploying

`npm ci` on the target installs the runtime dependencies - Bootstrap and htmx
are among them, deliberately not dev dependencies - and its postinstall hook
copies them into `public/libs`, which is not in git. If scripts are skipped
(`npm ci --ignore-scripts`), run `npm run vendor` by hand. The app refuses to
start while those files are missing, and says which.

The app answers a few paths at the domain root as well as under `APP_PATH`:
`/` (into sign-in), the legacy catalogue links `/viewer` and `/pdf/<name>`, and
`/robots.txt` (disallow everything). nginx should pass those through. Every
response also carries `X-Robots-Tag: noindex, nofollow`.

`APP_PATH` itself (`/bookshelf`, with or without the slash) redirects into
sign-in too; it used to answer a JSON line naming the app and its version to
anyone. Point uptime checks at `APP_PATH/healthcheck`, which answers 200 with
the database reachable and 503 otherwise.

Every state-changing request (sign-out, and every dashboard action) must come
from the app's own page, judged by the browser's `Sec-Fetch-Site` header or,
for a browser without it, by `Origin` against the host the app was reached at.
For that fallback nginx should pass the `Host` header through
(`proxy_set_header Host $host`) or set `X-Forwarded-Host`.

## Migrations

`npm run migrate` applies them and is safe over a database restored from the v1
dump. Every step checks what is already in place, so a run that failed mid-way
(MySQL commits DDL as it goes and cannot roll it back) is finished by simply
running it again. `20260921000003` adds the unique index on `tbl_users.du_id` and refuses,
naming the DU IDs, if the table already holds duplicates - decide which row to
keep for each, delete the others, and run it again.

**`npm run migrate:rollback` refuses by default.** Rolling back the v2 upgrades
drops `tbl_pdfs.uuid`, and those identifiers were minted when the migration ran
— re-running it generates different ones, so every catalogued and bookmarked
PDF link breaks permanently. Dashboard-edited titles, `sha256`, `uploaded_by`
and `is_active` (soft deletes) go with them. To undo a bad deploy, restore from
a dump.

On a throwaway local database, re-testing the migration is fine:

```
ALLOW_DESTRUCTIVE_ROLLBACK=1 npm run migrate:rollback
```

Never set that against a database anyone else is using.

## Browser support

pdf.js 6.3.289 is written for current browsers, and two of the built-ins it
calls only arrived in 2025-2026 (`Map.prototype.getOrInsertComputed` in
Firefox 144, Chrome 145 and Safari 18.4; `Math.sumPrecise`, `Promise.try`,
`RegExp.escape` and the `Uint8Array` base64 and hex methods a little
earlier). Without them the toolbar appears and the document never loads,
with the cause only in the console - which is what Firefox 140 ESR does.
`public/assets/js/browser-support.js` fills those in, on the page and,
through `pdf-worker.mjs`, in pdf.js's worker, so the floor is what the
library needs to load at all: iterator helpers - Firefox 131, Chrome 122,
Safari 18.4. Below that the viewer page shows a plain "update your browser"
message instead. Older Firefox builds can be tried locally through earlier
Playwright releases, which bundle them (Playwright 1.46 has Firefox 128,
1.48 has 131, 1.50 has 134, 1.54 has 140).

## Upgrading the PDF viewer

pdf.js is vendored into `public/libs/pdfjs` and committed, because npm's
`pdfjs-dist` ships the library but not the generic viewer application.

```
npm run vendor:pdfjs 6.3.289   # or a path to a pdfjs-<version>-dist.zip
```

The bundle is installed unmodified. Everything this app overrides - which PDF to
open, and where the worker/cmap/font/wasm assets live - is applied at runtime by
`public/assets/js/pdf-viewer-config.js` through the viewer's own
`webviewerloaded` hook, so an upgrade is just a re-run of that script. Do not
hand-edit files under `public/libs/pdfjs`: v1 and v2.0 did, and that is why a
2021 build with known CVEs stayed in place for five years.

After upgrading, diff the release's `web/viewer.html` against `views/viewer.ejs`
and carry over any new markup - the viewer only wires up element IDs that exist,
so new toolbar features stay dark until their markup is present. Keep the
`?v=<%= pdfjs_v %>` keys on the bundle's script and stylesheet URLs (the viewer
template test fails without them): the app reads the bundle's version at boot
and keys those URLs to it, so an upgrade reaches browsers at once instead of
after the day-long static cache ages out. Nothing needs bumping by hand.
## Maintainers

@freyesdulib

## License

Apache License 2.0
