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
- [Local development with Docker Compose](#local-development-with-docker-compose)
- [Running with the prebuilt image](#running-with-the-prebuilt-image)
- [LibreOffice sandbox snapshot](#libreoffice-sandbox-snapshot)
- [E-signing with Dokobit](#e-signing-with-dokobit)
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
   local equivalents — see [below](#local-development-with-docker-compose).
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
5. **Sign** — Instead of downloading the filled document, you can send it
   straight to **Dokobit** to be e-signed. You enter the signer's email; the
   server renders the PDF exactly as it would for a download, uploads it to
   Dokobit's Documents Gateway, opens a signing, and Dokobit emails that
   person their invitation. Locally this is faked end to end — no account
   needed — see [below](#e-signing-with-dokobit).

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
| API | [oRPC](https://orpc.dev) with [Zod 4](https://zod.dev) validation — one typed router ([src/server/orpc](src/server/orpc)) served at `/api/rpc`, called from the browser via the typed client in [orpc.ts](src/lib/orpc.ts) |
| Database | [Neon Postgres](https://neon.tech) (via Vercel Marketplace, `drizzle-orm`) — template metadata and detected fields ([schema.ts](src/db/schema.ts)) |
| File storage | [Vercel Blob](https://vercel.com/docs/storage/vercel-blob) (private) — stores uploaded `.docx` files |
| Templating | [docxtemplater](https://docxtemplater.com) — extracts `{{field}}` placeholders and renders the final document ([docx-template.ts](src/lib/docx-template.ts)) |
| PDF conversion | [Vercel Sandbox](https://vercel.com/docs/vercel-sandbox) running headless LibreOffice — converts rendered `.docx` to PDF, one at a time or in bulk ([docx-to-pdf.ts](src/lib/docx-to-pdf.ts)) |
| E-signing | [Dokobit Documents Gateway](https://gateway-sandbox.dokobit.com/api/doc) — uploads the filled PDF and invites a signer by email ([dokobit.ts](src/lib/dokobit.ts)), optional per deployment |

## Local development

```bash
npm install
vercel env pull --yes   # syncs DATABASE_URL, BLOB_READ_WRITE_TOKEN, etc.
npm run dev
```

## Local development with Docker Compose

[`docker-compose.yml`](docker-compose.yml) brings up a fully-offline stack —
no Neon, Vercel Blob, Vercel Sandbox, or Resend account needed — with three
services:

- **`db`** — a plain `postgres:16-alpine` container with a persisted volume.
- **`migrate`** — runs `drizzle-kit push` against it and seeds one static
  account (see below), then exits. Reuses the `app` image with a command
  override.
- **`app`** — `next dev` (the `dev` stage of [`Dockerfile`](Dockerfile)), at
  [http://localhost:3000](http://localhost:3000).

Sign in with the seeded account — `demo@example.com` /
`localpassword123` by default (change them in `.env.docker`, which is
gitignored like the other `.env*` files — create it yourself with
`LOCAL_MODE`, `DATABASE_URL`, `LOCAL_STORAGE_DIR`, `BETTER_AUTH_SECRET`,
`BETTER_AUTH_URL`, `LOCAL_AUTH_*`, and `NEXT_PUBLIC_LOCAL_*`; see the comments
in [`docker-compose.yml`](docker-compose.yml) and
[`docker-compose.prebuilt.yml`](docker-compose.prebuilt.yml) for the values
each expects). The sign-in/sign-up pages swap their usual email-code flow for
a plain password form whenever `LOCAL_MODE=true`, since there's no Resend
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

To point Docker Compose at the real cloud services instead (e.g. to test
against production data), remove `LOCAL_MODE` from `.env.docker` and fill in
`DATABASE_URL`, `BLOB_READ_WRITE_TOKEN`, `RESEND_API_KEY`, etc. from
`vercel env pull`.

Two ways to run it:

**Plain Compose** — brings the stack up, but you rebuild manually
(`docker compose up --build`) after changing source or dependencies:

```bash
docker compose up --build
```

**[Tilt](https://tilt.dev)** — same stack, with auto-refresh: Tilt
live-syncs changes to `src`/`public` straight into the running `app`
container, and Next's own Turbopack watcher picks them up and refreshes the
browser — no image rebuild, no restart. Tilt is managed by
[mise](https://mise.jdx.dev) (see [`mise.toml`](mise.toml)), so `mise install`
pulls it in alongside Node — no separate install needed.

```bash
tilt up
```

Open the URL Tilt prints (usually [http://localhost:10350](http://localhost:10350))
for the dev UI, service logs, and build status. The app itself is still at
[http://localhost:3000](http://localhost:3000). Changes to `package.json`,
`package-lock.json`, `Dockerfile`, or anything outside `src`/`public`
fall back to a normal image rebuild, since those need a fresh `npm ci` or
process restart anyway. Stop everything with `tilt down`.

For a fully offline demo shaped like production (a real `next build`, not
`next dev`), see [`docker-compose.prebuilt.yml`](#running-with-the-prebuilt-image)
below — it pulls prebuilt images from GHCR rather than building locally.

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

## E-signing with Dokobit

The **Sign with Dokobit** button on a template's fill page sends the filled
document off for a qualified e-signature (Mobile ID / Smart-ID / ID card) via
Dokobit's [Documents Gateway](https://gateway-sandbox.dokobit.com/api/doc).
The flow is: render the PDF → `POST /api/file/upload.json` → poll
`/api/file/upload/{token}/status.json` → `POST /api/signing/create.json`.
Passing the signer's email is what makes Dokobit send the invitation mail, so
the app never delivers the signing link itself (it does show it, so it can be
copied or re-sent).

Signing is limited to signed-in users and rate-limited more tightly than
plain document generation, since every call spends real Dokobit quota and
mails a real person.

### Locally, it's faked

Running in `LOCAL_MODE` with no `DOKOBIT_ACCESS_TOKEN` swaps in a simulated
gateway ([dokobit/fake.ts](src/lib/dokobit/fake.ts)) — the same substitution
LOCAL_MODE already makes for Blob storage and the PDF sandbox. Nothing leaves
the machine and no email is sent. Instead the rendered PDF is filed under
`dokobit/` in local storage, the details are printed to the server console,
and the signing link points at `/fake-dokobit/<token>`: a dev-only page that
shows the document and lets you click **Sign** to simulate the signature.

So `tilt up` gives you a working signing flow with no Dokobit account and no
configuration at all. Setting a real `DOKOBIT_ACCESS_TOKEN` always wins, so a
local stack can still be pointed at Dokobit's sandbox when you want to test
the real wire protocol:

```bash
# .env.docker — the file the containers read (`env_file:` in docker-compose.yml)
DOKOBIT_ACCESS_TOKEN=your-sandbox-token
DOKOBIT_API_URL=https://gateway-sandbox.dokobit.com
```

`.env*` is gitignored *and* dockerignored, so editing it won't trigger a Tilt
rebuild — restart with `tilt down && tilt up` to pick the change up.

Outside `LOCAL_MODE` the fake can't engage: `isFakeDokobit()` is false, the
`/fake-dokobit` route 404s, and its oRPC procedures refuse every call. Without
a token, a real deployment simply doesn't show the button.

| Variable | Required | Default | Notes |
| --- | --- | --- | --- |
| `DOKOBIT_ACCESS_TOKEN` | in production | — | Gateway access token; without it a real deployment doesn't offer signing. Not needed in `LOCAL_MODE`, which falls back to the fake. Sandbox and production tokens are different. |
| `DOKOBIT_API_URL` | no | `https://gateway.dokobit.com` | Set to `https://gateway-sandbox.dokobit.com` to test against the sandbox. |
| `DOKOBIT_SIGNING_TYPE` | no | `pdf` | Document type Dokobit creates. Use `pdflt` for the Lithuania-specific PDF signature some institutions require. |
| `DOKOBIT_LANGUAGE` | no | `lt` | Language of the signing UI and the invitation email (`lt`, `lv`, `et`, `en`, `ru`, `is`). |

Signing state isn't persisted: the app creates the signing and hands back the
link, but doesn't track whether it was completed. Dokobit can post signing
events back to a `postback_url` — wiring that up would be the next step if
you need signed documents returned to the app.

## Database schema changes

```bash
npx dotenv -e .env.local -- npx drizzle-kit push
```

## Admin panel

Signed-in users with `role: "admin"` on their `user` row can see every user
and template in the app at `/admin/dashboard` — everyone else gets a 404, same
as requesting another user's template. New users default to `role: "user"`;
promote one to admin with:

```bash
npx dotenv -e .env.local -- npm run set-admin -- someone@example.com
```
