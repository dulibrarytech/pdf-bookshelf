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
## Maintainers

@freyesdulib

## License

Apache License 2.0
