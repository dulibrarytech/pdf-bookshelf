# PDF Bookshelf v2

Makes purchased PDFs available to SSO-authenticated DU community members. 

## Local setup

```
# prerequisites: Node >= 22, MariaDB with the pdf_bookshelf database
cd pdf-bookshelf
npm install
npm run vendor        # copies Bootstrap/HTMX from node_modules into public/libs (self-hosted, CSP self-only)
cp .env-example .env  # then fill in values (the app refuses to start if a
                      # required one is missing, and names every one it needs)
npm run migrate       # applies knex migrations (safe over a database restored from the v1 dump)
npm test              # unit tests (node:test)
npm run dev           # http://localhost:8005/bookshelf/dashboard/home
```

## Migrations

`npm run migrate` applies them and is safe over a database restored from the v1
dump.

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
so new toolbar features stay dark until their markup is present.
## Maintainers

@freyesdulib

## License

Apache License 2.0
