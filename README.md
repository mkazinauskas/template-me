<div align="center">

# Template Me

**Turn a `.docx` with `{{placeholders}}` into a web form — fill it in, get back a PDF.**

One document at a time, or hundreds at once from a spreadsheet.

[![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js&logoColor=white)](https://nextjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)](https://react.dev)
[![Neon Postgres](https://img.shields.io/badge/Database-Neon_Postgres-00E599?logo=postgresql&logoColor=white)](https://neon.tech)
[![Deployed on Vercel](https://img.shields.io/badge/Deployed_on-Vercel-black?logo=vercel&logoColor=white)](https://vercel.com)

</div>

---

Upload a Word template and the app scans it for tags like `{{first_name}}`,
builds a form with the right input for each one (text, number, date, a
yes/no switch, a dropdown), and renders a live PDF preview as you type. When
you're happy with it, download the filled-in PDF — or upload a CSV to
generate dozens of them at once, packaged into a `.zip`.

## Contents

- [How it works](#how-it-works)
- [Supported field types](#supported-field-types)
- [Stack](#stack)
- [Local development](#local-development)
- [Running locally with Docker Compose](#running-locally-with-docker-compose)
- [LibreOffice sandbox snapshot](#libreoffice-sandbox-snapshot)
- [Database schema changes](#database-schema-changes)

## How it works

1. **Upload** — You upload a `.docx` file on the home page. The server reads
   the document's raw XML text (via `docxtemplater`) and regex-matches every
   `{{...}}` tag, regardless of what Word formatting run it landed in.
   Each tag is parsed into a field: a key, an optional type, and optional
   type arguments (`{{birthday|date("dd/mm/yyyy")}}`,
   `{{active|boolean("Yes", "No")}}`, `{{plan|select("Basic","Pro")}}`). The
   original `.docx` goes to **Vercel Blob** (private); the parsed field list
   and template metadata go to **Neon Postgres** via `drizzle-orm`
   ([schema.ts](src/db/schema.ts)).
2. **Fill** — The template's page builds a form from its field list — one
   input per field, grouped into fieldsets when keys share a dot-prefix
   (`person.first_name` + `person.last_name` → a "Person" group). Every
   keystroke debounces a request to render a live PDF preview in an iframe,
   so you see the real output before committing to a download.
3. **Render** — On submit, the server re-fetches the original `.docx` from
   Blob storage, injects your values into the `{{...}}` tags with
   `docxtemplater` (formatting each value per its field type — see below),
   and hands the rendered `.docx` to a **Vercel Sandbox** microVM running
   headless LibreOffice, which converts it to PDF. There's no pure-Node
   docx→PDF renderer with acceptable fidelity, so this shells out to
   `soffice` inside an ephemeral, disposable VM. To keep this fast, the
   sandbox boots from a pre-built snapshot that already has LibreOffice
   installed (~1-2s) rather than installing it from scratch (~60s).
4. **Bulk generation** — Instead of filling one form, you can download a
   ready-made CSV template (one column per field, headed with the field's
   raw `{{tag}}` so it's unambiguous which column fills what), fill it in a
   spreadsheet app, and upload it back. Columns are auto-matched to fields
   by name; you can remap them and preview any row before generating. All
   rows are rendered and converted to PDF in a single LibreOffice
   invocation, then zipped together for download — much cheaper than
   booting a sandbox per document.

## Supported field types

The type comes from a `|type(...)` suffix on the tag; a bare `{{key}}` is
treated as `string`.

| Tag syntax | Form input | Notes |
| --- | --- | --- |
| `{{key}}` | Text field | Plain string, inserted as-is. |
| `{{key\|number(2)}}` | Number field | The argument is the decimal places to round/pad to (`(1234.5).toFixed(2)` → `1234.50`); omit it to insert the number as typed. |
| `{{key\|date("yyyy-mm-dd")}}` | Date picker | The argument is the output format, using `yyyy`/`mm`/`dd` tokens in any arrangement (e.g. `"dd/mm/yyyy"`). Defaults to `yyyy-mm-dd`. |
| `{{key\|boolean("Yes","No")}}` | Toggle switch | Renders the first argument when on, the second when off. Defaults to `"Yes"` / `"No"`. Unlike other types, boolean fields are never "required" — an unset toggle just renders as false. |
| `{{key\|select("A","B","C")}}` | Dropdown | Arguments are the selectable options; the submitted value must be one of them. |

A tag key with a dot, like `person.first_name`, is split into a group
(`person`) and its own label (`first_name`) — fields sharing a group are
rendered together under one heading in the fill form. Any `\|type` the app
doesn't recognize falls back to plain text, with a warning shown after
upload so you know it wasn't silently mis-rendered.

## Stack

| Layer | Technology |
| --- | --- |
| Framework | [Next.js](https://nextjs.org) (App Router) — UI + API routes |
| Database | [Neon Postgres](https://neon.tech) (via Vercel Marketplace, `drizzle-orm`) — template metadata and detected fields ([schema.ts](src/db/schema.ts)) |
| File storage | [Vercel Blob](https://vercel.com/docs/storage/vercel-blob) (private) — stores uploaded `.docx` files |
| Templating | [docxtemplater](https://docxtemplater.com) — extracts `{{field}}` placeholders and renders the final document ([docx-template.ts](src/lib/docx-template.ts)) |
| PDF conversion | [Vercel Sandbox](https://vercel.com/docs/vercel-sandbox) running headless LibreOffice — converts rendered `.docx` to PDF, one at a time or in bulk ([docx-to-pdf.ts](src/lib/docx-to-pdf.ts)) |

## Local development

```bash
npm install
vercel env pull --yes   # syncs DATABASE_URL, BLOB_READ_WRITE_TOKEN, etc.
npm run dev
```

## Running locally with Docker Compose

```bash
vercel env pull --yes   # syncs .env.local if you haven't already
docker compose up --build
```

This builds a production (`next build` + standalone server) image and runs
it at [http://localhost:3000](http://localhost:3000) — no hot reload, no
bind-mounted source; it's a self-contained local setup rather than a dev
loop (use `npm run dev` for that). Rebuild the image (`docker compose up
--build`) after changing source or dependencies.

It still talks to the real Neon Postgres, Vercel Blob, and Vercel Sandbox
services using the credentials in `.env.local` — those are cloud services
with no local/offline equivalent, so Docker Compose only containerizes the
Next.js app itself, not the database or sandbox. `docker-compose.yml` just
builds the [Dockerfile](Dockerfile) and loads `.env.local` as the
container's environment:

```yaml
services:
  app:
    build:
      context: .
      dockerfile: Dockerfile
    ports:
      - "3000:3000"
    env_file:
      - .env.local
```

## LibreOffice sandbox snapshot

PDF conversion boots a Vercel Sandbox from a pre-built snapshot
(`LIBREOFFICE_SANDBOX_SNAPSHOT_ID` env var) with LibreOffice already
installed, so conversion takes ~1-2s instead of the ~60s a from-scratch
install would need. To rebuild the snapshot (e.g. after a LibreOffice
version bump or if the snapshot expires):

```bash
npx dotenv -e .env.local -- npx tsx scripts/create-libreoffice-snapshot.ts
```

Then update `LIBREOFFICE_SANDBOX_SNAPSHOT_ID` locally and with
`vercel env add LIBREOFFICE_SANDBOX_SNAPSHOT_ID`.

## Database schema changes

```bash
npx dotenv -e .env.local -- npx drizzle-kit push
```
