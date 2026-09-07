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
- [Deploying to Vercel](#deploying-to-vercel)
- [Google sign-in](#google-sign-in)
- [Deploying to Coolify](#deploying-to-coolify)
- [LibreOffice sandbox snapshot](#libreoffice-sandbox-snapshot)
- [Database schema changes](#database-schema-changes)
- [Admin panel](#admin-panel)

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

## Local development

There are two ways to run the app locally. This section is the **cloud-backed**
one — it talks to the same Neon/Blob/Sandbox/Resend services production uses, so
it needs a Vercel project to pull credentials from. If you'd rather run
everything offline with no accounts at all, skip to
[Docker Compose](#local-development-with-docker-compose).

**Prerequisites:** Node 24 and, optionally,
[Tilt](https://tilt.dev) for the Docker path. Both are pinned in
[`mise.toml`](mise.toml), so `mise install` sets them up; any Node ≥ 22.12
works if you'd rather manage it yourself.

```bash
npm install
vercel env pull --yes   # writes .env.local
npx dotenv -e .env.local -- npx drizzle-kit push   # first run only: create the tables
npm run dev
```

The app is then at [http://localhost:3000](http://localhost:3000).

`vercel env pull` writes the linked project's environment into `.env.local`.
What the app reads from it:

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Neon Postgres connection string ([db/index.ts](src/db/index.ts)). |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob store for uploaded `.docx` files. Read by `@vercel/blob` under this exact name. |
| `BETTER_AUTH_SECRET` | Signs session cookies. Generate one with `openssl rand -base64 32`. |
| `BETTER_AUTH_URL` | The site's public origin. Only load-bearing off Vercel — on Vercel, `VERCEL_URL` wins ([env.ts](src/lib/env.ts)). |
| `RESEND_API_KEY`, `RESEND_FROM_EMAIL` | Sends the sign-in code ([email.ts](src/lib/email.ts)). |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Optional. Enables "Continue with Google" ([auth-providers.ts](src/lib/auth-providers.ts)). Set both or neither — a half-configured pair fails startup. |
| `VERCEL_OIDC_TOKEN` | Authenticates Vercel Sandbox for PDF conversion. **Development tokens expire after 12 hours** — re-run `vercel env pull` when previews suddenly stop rendering. |
| `LIBREOFFICE_SANDBOX_SNAPSHOT_ID` | Optional. Boots the sandbox from a pre-built snapshot instead of installing LibreOffice per request (see [below](#libreoffice-sandbox-snapshot)). |

Environment variables have exactly two entry points, split along the
server/client boundary:

- [`src/lib/env.ts`](src/lib/env.ts) — the server environment. One Zod schema
  declaring every variable, its type, its default, and which are required
  where. Never reaches the browser bundle.
- [`src/lib/env-client.ts`](src/lib/env-client.ts) — the `NEXT_PUBLIC_*`
  variables, exported as `clientEnv`. The only env module a client component
  may import.

Nothing else in `src/` touches `process.env` — an ESLint rule
([eslint.config.mjs](eslint.config.mjs)) enforces that, so a new variable has
to be declared in one of the two schemas to be usable.

That schema is validated on **every startup**: at import time on the server,
and again from `register()` in
[`src/instrumentation.ts`](src/instrumentation.ts), which Next.js runs once per
server instance before it handles any request. A misconfigured deployment
therefore fails immediately with a list of exactly what is wrong, rather than
throwing something opaque on the first request that touches a missing value.
The *required* rules only apply to production builds — `next dev` lets you
start with pieces missing and only fails when you reach the feature that needs
them — but malformed values (say a `BETTER_AUTH_URL` that isn't a URL) are
rejected everywhere.

`env-client.ts` spells its variables out as literal `process.env.NEXT_PUBLIC_*`
reads, which is what lets Next.js inline them into the browser bundle at build
time. The one place the two files meet is `NEXT_PUBLIC_LOCAL_AUTH_PASSWORD`:
the server schema refuses a production build that has it set, since only the
server can fail a build.

Other commands:

```bash
npm test           # Vitest unit + component tests
npm run test:e2e   # Playwright end-to-end tests (needs `tilt up` running — see below)
npm run lint       # ESLint
npm run knip       # unused files, exports and dependencies
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

## Deploying to Vercel

Vercel is the default target: it's the one environment where all four managed
dependencies — Neon Postgres, Vercel Blob, Vercel Sandbox and Resend — are
available without extra plumbing.

1. **Import the repository** at [vercel.com/new](https://vercel.com/new). The
   Next.js preset is detected automatically; leave the build settings alone.
   Vercel prefers the `vercel-build` script in [`package.json`](package.json)
   over `build`, and that's what rebuilds the LibreOffice snapshot on every
   deploy (see [below](#libreoffice-sandbox-snapshot)).
2. **Add a Neon Postgres database** from the project's Storage tab (Vercel
   Marketplace → Neon). It sets `DATABASE_URL` and the `POSTGRES_*` aliases on
   every environment for you.
3. **Add a Blob store** from the same tab. It sets `BLOB_READ_WRITE_TOKEN`.
4. **Set the rest** under Settings → Environment Variables:

   | Variable | Value |
   | --- | --- |
   | `BETTER_AUTH_SECRET` | `openssl rand -base64 32`, a distinct value per environment. |
   | `RESEND_API_KEY` | A [Resend](https://resend.com) API key — sign-in codes are emailed through it. |
   | `RESEND_FROM_EMAIL` | A sender address on a domain verified with Resend. |
   | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Optional — see [Google sign-in](#google-sign-in). Omit both to offer only email codes. |

   `BETTER_AUTH_URL` is **not** needed here: the site origin resolved in
   [`env.ts`](src/lib/env.ts) — used for both better-auth's `baseURL` and page
   metadata — prefers `VERCEL_PROJECT_PRODUCTION_URL` / `VERCEL_URL`, which the
   platform sets on every deployment. Vercel Sandbox needs no configuration either — deployed
   functions authenticate to it with the OIDC token Vercel injects.

5. **Create the tables** once, against the production database:

   ```bash
   vercel env pull .env.production.local --yes --environment production
   npx dotenv -e .env.production.local -- npx drizzle-kit push
   ```

6. **Deploy** — push to `main`, or run `npx vercel --prod`.

Two things the code enforces rather than assumes, worth knowing if a deploy
behaves unexpectedly:

- [`next.config.ts`](next.config.ts) drops `output: "standalone"` whenever the
  `VERCEL` env var is present. The standalone build exists for the Docker image
  and collides with Vercel's own build tracing (`ENOENT` on
  `next-server.js.nft.json`).
- [`src/lib/env.ts`](src/lib/env.ts) refuses to complete a production build with
  `NEXT_PUBLIC_LOCAL_AUTH_PASSWORD` set. `NEXT_PUBLIC_*` values are inlined into
  the client bundle, so a project that accidentally inherited the local-mode
  variables would otherwise ship a working credential to every visitor.

## Google sign-in

Sign-in is email codes by default. Setting `GOOGLE_CLIENT_ID` and
`GOOGLE_CLIENT_SECRET` adds a "Continue with Google" button above the email
form; leaving them unset removes both the button and the underlying
`/api/auth/sign-in/social` endpoint. One function decides both —
[`isGoogleAuthEnabled()`](src/lib/auth-providers.ts) — so the button can never
point at a provider that isn't registered. The pages read it per request, so
adding or removing the credentials takes effect on the next page load rather
than the next build.

To set it up:

1. In the [Google Cloud console](https://console.cloud.google.com/apis/credentials),
   create an **OAuth client ID** of type *Web application*.
2. Add the redirect URI for each origin the app runs on — the path is always
   `/api/auth/callback/google`:

   ```
   https://your-app.vercel.app/api/auth/callback/google
   http://localhost:3000/api/auth/callback/google
   ```

   Preview deployments get a different hostname per deploy, so Google sign-in
   only works on previews whose URL you have added here.

3. Put the client ID and secret in the environment (`vercel env add`, or
   `.env.local` for local development). Set both or neither: `env.ts` fails
   startup on a half-configured pair rather than silently hiding the button.

Accounts link by email. Someone who first signed in with an email code and
later uses Google lands in the same account, because
[`auth.ts`](src/lib/auth.ts) lists Google as a trusted provider — safe
specifically because Google only returns addresses it has verified.

## Deploying to Coolify

Self-hosting on [Coolify](https://coolify.io) means running the app in
`LOCAL_MODE`, the same switch [Docker Compose](#local-development-with-docker-compose)
uses. That isn't only about avoiding cloud accounts: `createPdfSandbox()` in
[docx-to-pdf.ts](src/lib/docx-to-pdf.ts) only bypasses Vercel Sandbox when
`LOCAL_MODE=true`, and the SDK authenticates through an OIDC token that exists
only on Vercel. Off-platform, the in-image LibreOffice is the conversion path.

So a Coolify deployment gets: Postgres in a container, uploads on a mounted
volume, `soffice` in the app image, and email/password sign-in instead of
emailed codes.

**Deploy it as a Docker Compose resource** — that's the only shape that also
runs the one-shot migration/seed step. In Coolify: *New Resource → Docker
Compose*, point it at your fork of this repository, and use the following
compose file. It builds the [`Dockerfile`](Dockerfile)'s `runner` and
`migrator` stages rather than pulling the published `-demo` image, which has
the public demo credentials baked into its client bundle.

```yaml
services:
  db:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: app
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: app
    volumes:
      - db-data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U app"]
      interval: 2s
      timeout: 5s
      retries: 30

  # Runs `drizzle-kit push` and seeds the first account, then exits. Needs the
  # devDependencies (drizzle-kit, tsx) that the runtime image doesn't carry.
  migrate:
    build:
      context: .
      dockerfile: Dockerfile
      target: migrator
    environment: &app-env
      LOCAL_MODE: "true"
      DATABASE_URL: postgres://app:${POSTGRES_PASSWORD}@db:5432/app
      LOCAL_STORAGE_DIR: /data/blobs
      BETTER_AUTH_SECRET: ${BETTER_AUTH_SECRET}
      BETTER_AUTH_URL: ${APP_URL}
      LOCAL_AUTH_EMAIL: ${ADMIN_EMAIL}
      LOCAL_AUTH_PASSWORD: ${ADMIN_PASSWORD}
      LOCAL_AUTH_NAME: Admin
    depends_on:
      db:
        condition: service_healthy

  app:
    build:
      context: .
      dockerfile: Dockerfile
      target: runner
      args:
        # NEXT_PUBLIC_* values are inlined into the client bundle at build
        # time, so this has to be a build arg — a runtime env var alone would
        # leave the sign-in page rendering the email-code form.
        NEXT_PUBLIC_LOCAL_MODE: "true"
        LOCAL_MODE: "true"
    restart: unless-stopped
    environment: *app-env
    # Coolify's proxy reaches the container over the Docker network, so the
    # port only needs exposing, not publishing on the host.
    expose:
      - "3000"
    volumes:
      - blob-data:/data/blobs
    depends_on:
      migrate:
        condition: service_completed_successfully

volumes:
  db-data:
  blob-data:
```

Then, in Coolify:

- **Set the environment variables** the file interpolates —
  `POSTGRES_PASSWORD`, `BETTER_AUTH_SECRET` (`openssl rand -base64 32`),
  `ADMIN_EMAIL`, `ADMIN_PASSWORD`, and `APP_URL`. `APP_URL` must be the full
  public origin with scheme and no trailing slash (`https://templates.example.com`);
  better-auth uses it as its `baseURL`, and sign-in fails with an origin
  mismatch if it disagrees with the domain Coolify serves.
- **Assign that domain** to the `app` service on port 3000, and let Coolify
  terminate TLS. The app sends `Strict-Transport-Security` on every response
  ([next.config.ts](next.config.ts)), so serving it over plain HTTP on a real
  domain will cause trouble later.
- **Keep both volumes.** `blob-data` holds every uploaded `.docx` — without it,
  templates survive exactly as long as the container does.
- **Give it room.** LibreOffice is the memory-hungry part; ~1 GB for the `app`
  container is a reasonable floor, and the image is large (a few hundred MB)
  because it carries LibreOffice and its fonts.

A few consequences of `LOCAL_MODE` worth being explicit about:

- **Sign-up is closed by default.** [`auth.ts`](src/lib/auth.ts) sets
  `disableSignUp` unless `LOCAL_ALLOW_SIGNUP=true`, so the instance has exactly
  the one account the `migrate` service seeded. Setting `LOCAL_ALLOW_SIGNUP=true`
  on the `app` service opens registration to anyone who can reach the URL —
  reasonable on a private network, not on the open internet.
- **Don't set `NEXT_PUBLIC_LOCAL_AUTH_EMAIL` / `NEXT_PUBLIC_LOCAL_AUTH_PASSWORD`.**
  They only pre-fill the sign-in form for the local demo, and being
  `NEXT_PUBLIC_*` they are inlined into the client bundle — on a real
  deployment that publishes your admin password.
- **There's no email.** `RESEND_*` is unused in this mode, so there's no
  password reset or emailed code; the seeded account is the way in.
- **Promote an admin** (for `/admin/dashboard`) by running the script in the
  migrate image's container, with the same `DATABASE_URL`:

  ```bash
  npx tsx scripts/set-admin.ts someone@example.com
  ```

If you'd rather deploy the prebuilt image than build from source, the same
compose file works with `image: ghcr.io/mkazinauskas/template-me:latest-demo`
and `:latest-migrator` in place of the two `build:` blocks — but see
[Running with the prebuilt image](#running-with-the-prebuilt-image) for what
those tags bake in, including the published demo password.

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
and template in the app at `/admin/dashboard` — everyone else gets a 404, same
as requesting another user's template. New users default to `role: "user"`;
promote one to admin with:

```bash
npx dotenv -e .env.local -- npm run set-admin -- someone@example.com
```
