## Docx Template → PDF

Upload a `.docx` file containing `{{field_name}}` placeholders. The app reads
the placeholders straight out of the document, builds a form for them
automatically, and lets you fill it in and download a rendered PDF.

### Stack

- **Next.js** (App Router) — UI + API routes
- **Neon Postgres** (via Vercel Marketplace, `drizzle-orm`) — stores template
  metadata and the detected field list (`src/db/schema.ts`)
- **Vercel Blob** (private) — stores the uploaded `.docx` files
- **docxtemplater** — extracts `{{field}}` placeholders and renders the final
  document with submitted values (`src/lib/docx-template.ts`)
- **Vercel Sandbox** running headless LibreOffice — converts the rendered
  `.docx` to PDF (`src/lib/docx-to-pdf.ts`); there is no pure-Node docx→pdf
  renderer with acceptable fidelity, so this shells out to `soffice` inside
  an ephemeral microVM

### Local development

```bash
npm install
vercel env pull --yes   # syncs DATABASE_URL, BLOB_READ_WRITE_TOKEN, etc.
npm run dev
```

### Running locally with Docker Compose

```bash
vercel env pull --yes   # syncs .env.local if you haven't already
docker compose up --build
```

This builds a production (`next build` + `next start`-equivalent standalone
server) image and runs it on http://localhost:3000 — no hot reload, no
bind-mounted source; it's meant as a self-contained local setup rather than
a dev loop (use `npm run dev` for that). Rebuild the image (`docker compose
up --build`) after changing source or dependencies.

It still talks to the real Neon Postgres, Vercel Blob, and Vercel Sandbox
services using the credentials in `.env.local` — those are cloud services
with no local/offline equivalent, so Docker Compose only containerizes the
Next.js app itself, not the database or sandbox.

### LibreOffice sandbox snapshot

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

### Database schema changes

```bash
npx dotenv -e .env.local -- npx drizzle-kit push
```
