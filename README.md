# PDF Bookshelf v2

Makes purchased PDFs available to SSO-authenticated DU community members. 

## Local setup

```
# prerequisites: Node >= 22, MariaDB with the pdf_bookshelf database
cd pdf-bookshelf
npm install
npm run vendor        # copies Bootstrap/HTMX from node_modules into public/libs (self-hosted, CSP self-only)
cp .env-example .env  # then fill in values
npm run migrate       # applies knex migrations (safe over a database restored from the v1 dump)
npm test              # unit tests (node:test)
npm run dev           # http://localhost:8005/bookshelf/dashboard/home
```

## Architecture

Module-per-feature: `auth/` (SSO + session + guards), `pdfs/` (viewer + delivery),
`dashboard/` (bookshelf table + metadata edit), `users/`, `uploads/`, `utils/`
(healthcheck + storage re-sync), with `config/`, `libs/`, `knex/migrations/`, `views/`
(+ `views/fragments/` for HTMX partials), `public/` (self-hosted assets only),
`storage/` (PDF files, not in git).

### PDF delivery

`GET /pdf/:uuid` looks the uuid up in `tbl_pdfs` first — the database row is the
allowlist — then streams with `res.sendFile(root: storage)`, which refuses traversal.
Unknown ids 404 before any filesystem access. Hits are counted with an atomic
`increment`. Legacy v1 filename URLs 301 to the canonical uuid URL, and `/viewer` at
the domain root redirects into the app path.

## Maintainers

@freyesdulib

## License

Apache License 2.0
