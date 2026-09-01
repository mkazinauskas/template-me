<div align="center">

# Template Me

**Turn a `.docx` with `{{placeholders}}` into a web form — fill it in, get back a PDF.**

One document at a time, or hundreds at once from a spreadsheet.

[![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js&logoColor=white)](https://nextjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)](https://react.dev)
[![Neon Postgres](https://img.shields.io/badge/Database-Neon_Postgres-00E599?logo=postgresql&logoColor=white)](https://neon.tech)
[![Deployed on Vercel](https://img.shields.io/badge/Deployed_on-Vercel-black?logo=vercel&logoColor=white)](https://vercel.com)

**[template-me.modakoda.eu](https://template-me.modakoda.eu/)**

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
- [Local development with Tilt](#local-development-with-tilt)
- [Running with the prebuilt image](#running-with-the-prebuilt-image)
- [LibreOffice sandbox snapshot](#libreoffice-sandbox-snapshot)
- [Database schema changes](#database-schema-changes)

## How it works

1. **Upload** — You upload a `.docx` file on the home page. The server reads
   the document's raw XML text (via `docxtemplater`) and regex-matches every
   `{{...}}` tag, regardless of what Word formatting run it landed in.
   Each tag is parsed into a field: a key, an optional type, and optional
   type arguments (see [supported field types](#supported-field-types)
   below). The original `.docx` goes to **Vercel Blob** (private); the parsed field list
   and template metadata go to **Neon Postgres** via `drizzle-orm`
   ([schema.ts](src/db/schema.ts)). Running via Docker Compose swaps both for
   local equivalents — see [below](#running-locally-with-docker-compose).
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
   `soffice` inside an ephemeral, disposable VM booted from a pre-built
   snapshot (see [below](#libreoffice-sandbox-snapshot)).
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
| `{{key\|checkbox}}` | Checkbox | Renders `☒` when checked, `☐` when not. Like boolean fields, checkbox fields are never "required" — an unset checkbox just renders as unchecked. |

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

> For local setup, prefer
> [`docker-compose.prebuilt.yml`](#running-with-the-prebuilt-image) — it
> pulls prebuilt images instead of building LibreOffice from scratch, so it
> comes up much faster. Use the `docker compose up --build` flow below only
> if you're changing source or dependencies and need a fresh local build.

```bash
docker compose up --build
```

That's it — no Neon, Vercel Blob, Vercel Sandbox, or Resend account needed.
`docker compose up` brings up three services:

- **`db`** — a plain `postgres:16-alpine` container with a persisted volume.
- **`migrate`** — runs `drizzle-kit push` against it and seeds one static
  account (see below), then exits.
- **`app`** — the Next.js production build, at
  [http://localhost:3000](http://localhost:3000).

Sign in with the seeded account — `demo@example.com` /
`localpassword123` by default (change them in `.env.docker`, which is
created the first time you run this and gitignored like the other `.env*`
files). The sign-in/sign-up pages swap their usual email-code flow for a
plain password form whenever `LOCAL_MODE=true`, since there's no Resend
account locally to send the OTP email through — see
[`auth-form.tsx`](src/components/auth-form.tsx).

`LOCAL_MODE=true` (set in `.env.docker`) is what switches the app into this
fully offline mode everywhere it would otherwise reach a cloud service:

| Concern | Cloud (default) | `LOCAL_MODE=true` |
| --- | --- | --- |
| Database | Neon Postgres over `@neondatabase/serverless` | The `db` container over plain `node-postgres` ([db/index.ts](src/db/index.ts)) |
| File storage | Vercel Blob | Local disk under `LOCAL_STORAGE_DIR`, in the `blob-data` volume ([storage.ts](src/lib/storage.ts)) |
| PDF conversion | Headless LibreOffice in a Vercel Sandbox microVM | Headless LibreOffice installed directly in the image (`apk add libreoffice`), invoked with `child_process` ([docx-to-pdf.ts](src/lib/docx-to-pdf.ts)) |
| Sign-in | Email OTP via Resend | Static email/password, seeded by [`scripts/seed-local-user.ts`](scripts/seed-local-user.ts) |

This is a self-contained local setup rather than a dev loop — no hot reload,
no bind-mounted source (use `npm run dev`, or [Tilt](#local-development-with-tilt)
for a containerized dev loop with hot reload). Rebuild
(`docker compose up --build`) after changing source or dependencies.

To point Docker Compose at the real cloud services instead (e.g. to test
against production data), remove `LOCAL_MODE` from `.env.docker` and fill in
`DATABASE_URL`, `BLOB_READ_WRITE_TOKEN`, `RESEND_API_KEY`, etc. from
`vercel env pull`.

## Local development with Tilt

Same fully-offline stack as `docker compose up` above (needs `.env.docker` —
see the previous section), but with auto-refresh: [Tilt](https://tilt.dev)
live-syncs changes to `src`/`public` straight into the running `app`
container, and Next's own Turbopack watcher picks them up and refreshes the
browser — no image rebuild, no restart.

```bash
tilt up
```

Open the URL Tilt prints (usually [http://localhost:10350](http://localhost:10350))
for the dev UI, service logs, and build status. The app itself is at
[http://localhost:3000](http://localhost:3000), same as the plain Compose
setup.

This works by layering [`docker-compose.dev.yml`](docker-compose.dev.yml) on
top of `docker-compose.yml` (see [`Tiltfile`](Tiltfile)): `db` and `migrate`
are unchanged, but `app` runs [`Dockerfile.dev`](Dockerfile.dev) (`next dev`)
instead of a production build. Changes to `package.json`, `package-lock.json`,
`Dockerfile.dev`, or anything outside `src`/`public` fall back to a normal
image rebuild, since those need a fresh `npm ci` or process restart anyway.

Stop everything with `tilt down`.

## Running with the prebuilt image

Same fully-offline demo as above, but pulling prebuilt images from GHCR
instead of building them locally — much faster since it skips installing
LibreOffice from scratch:

```bash
docker compose -f docker-compose.prebuilt.yml up
```

This is self-contained: you only need
[`docker-compose.prebuilt.yml`](docker-compose.prebuilt.yml) itself, not a
full checkout of the repo. It pulls `ghcr.io/mkazinauskas/template-me:latest-demo`
(the app, built with `LOCAL_MODE` baked in) and `:latest-migrator` (the
one-shot migration/seed step), published by
[`docker-publish.yml`](.github/workflows/docker-publish.yml) on every push
to `main`. Sign in with the same seeded account as above —
`demo@example.com` / `localpassword123`.

To update to the latest published images:

```bash
docker compose -f docker-compose.prebuilt.yml pull
docker compose -f docker-compose.prebuilt.yml up
```

Note that these `-demo`/`-migrator` tags are separate from the plain
`:latest` image also published by that workflow — `:latest` is a normal
production build (no `LOCAL_MODE`), meant for deploying against real Neon
Postgres / Vercel Blob / Vercel Sandbox / Resend credentials rather than
this local demo.

## LibreOffice sandbox snapshot

PDF conversion boots a Vercel Sandbox from a pre-built snapshot with
LibreOffice already installed, so conversion takes ~1-2s instead of the
~60s a from-scratch install would need.

The snapshot is rebuilt automatically on every Vercel build: the
`vercel-build` script (`scripts/write-libreoffice-snapshot.ts`) installs
LibreOffice + the fonts listed in `src/lib/libreoffice-deps.ts` into a
fresh sandbox, snapshots it, and bakes the resulting ID into
`src/lib/libreoffice-snapshot.generated.ts`, which ships as part of that
deployment. This means the snapshot's fonts/deps can never drift out of
sync with the code that expects them — no manual step after changing
`LO_DEPS`. Snapshots expire after 14 days so old ones don't pile up. If
snapshot creation fails during a build (sandbox API hiccup, etc.), the
build still succeeds — the deployment just falls back to
`LIBREOFFICE_SANDBOX_SNAPSHOT_ID` (if set) or a from-scratch install at
request time.

For local testing of a `LO_DEPS` change before pushing it (or to pin a
deployment to a specific snapshot as a manual override):

```bash
npx dotenv -e .env.local -- npx tsx scripts/create-libreoffice-snapshot.ts
```

then set `LIBREOFFICE_SANDBOX_SNAPSHOT_ID` locally and/or with
`vercel env add LIBREOFFICE_SANDBOX_SNAPSHOT_ID` — it only takes effect
when the build-time generated snapshot is unavailable.

## Database schema changes

```bash
npx dotenv -e .env.local -- npx drizzle-kit push
```

## Admin panel

Signed-in users with `role: "admin"` on their `user` row can see every user
and template in the app at `/admin` — everyone else gets a 404, same as
requesting another user's template. New users default to `role: "user"`;
promote one to admin with:

```bash
npx dotenv -e .env.local -- npm run set-admin -- someone@example.com
```
