# Shared base for every stage that runs docx->pdf conversion via a local
# `soffice` binary (LOCAL_MODE): the `dev` stage (through `deps`) used by
# docker-compose's `app`/`migrate` services, and the standalone `runner`.
# Keeping the install here means dev and prod render PDFs with the exact same
# LibreOffice + font set.
# font-noto-cjk is required — without it, LibreOffice has no glyphs for CJK
# templates and renders that text as tofu boxes in the generated PDF.
# font-noto covers everything else Times New Roman falls back to when it's
# not installed (e.g. Lithuanian/Baltic ogonek letters į, ų), which
# otherwise render as tofu boxes the same way.
# font-liberation and font-carlito are metric-compatible replacements for
# Arial/Times New Roman/Courier New and Calibri — the fonts most .docx
# templates actually use. Without them LibreOffice substitutes a font with
# different glyph widths, so generated PDFs wrap/paginate differently than
# the same document opened in Word.
# Caladea is the metric-compatible Cambria replacement (equivalent to
# google-crosextra-caladea-fonts used on the Fedora/sandbox path). Alpine
# has no package for it, so we download it directly from Google Fonts.
# Without it, LibreOffice falls back to Noto Serif, whose wider glyphs cause
# lines to overflow their layout boxes — producing the garbled/overlapping
# text corruption visible in the local preview.
FROM node:24-alpine AS base
WORKDIR /app
RUN apk add --no-cache libreoffice font-noto-cjk font-noto font-liberation font-carlito curl \
 && mkdir -p /usr/share/fonts/caladea \
 && curl -sL "https://github.com/google/fonts/raw/main/ofl/caladea/Caladea-Regular.ttf"  -o /usr/share/fonts/caladea/Caladea-Regular.ttf \
 && curl -sL "https://github.com/google/fonts/raw/main/ofl/caladea/Caladea-Bold.ttf"     -o /usr/share/fonts/caladea/Caladea-Bold.ttf \
 && curl -sL "https://github.com/google/fonts/raw/main/ofl/caladea/Caladea-Italic.ttf"   -o /usr/share/fonts/caladea/Caladea-Italic.ttf \
 && curl -sL "https://github.com/google/fonts/raw/main/ofl/caladea/Caladea-BoldItalic.ttf" -o /usr/share/fonts/caladea/Caladea-BoldItalic.ttf \
 && fc-cache -f /usr/share/fonts/caladea

FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

# Dev image for the `app` and `migrate` services in docker-compose.yml.
# Unlike the `runner` stage below, this runs `next dev` directly instead of a
# standalone production build. Under `tilt up`, Tilt live-syncs source changes
# into the running container (see Tiltfile) and Next's own Turbopack watcher
# picks them up and refreshes the browser; under plain `docker compose up` you
# get the same dev server without the live-sync. It keeps devDependencies
# (drizzle-kit, tsx) from the `deps` stage, so `migrate` reuses this same
# image with a command override rather than needing its own build.
FROM deps AS dev
COPY . .
EXPOSE 3000
CMD ["npx", "next", "dev"]

FROM node:24-alpine AS builder
WORKDIR /app
# NEXT_PUBLIC_* vars are inlined into the client bundle at build time, so
# they have to arrive as build args, not just runtime env — see
# docker-publish.yml's `-demo` build-args (this Dockerfile's `runner` stage
# isn't used by local Docker Compose anymore; see Dockerfile.dev).
ARG NEXT_PUBLIC_LOCAL_MODE
ARG NEXT_PUBLIC_LOCAL_AUTH_EMAIL
ARG NEXT_PUBLIC_LOCAL_AUTH_PASSWORD
ENV NEXT_PUBLIC_LOCAL_MODE=$NEXT_PUBLIC_LOCAL_MODE
ENV NEXT_PUBLIC_LOCAL_AUTH_EMAIL=$NEXT_PUBLIC_LOCAL_AUTH_EMAIL
ENV NEXT_PUBLIC_LOCAL_AUTH_PASSWORD=$NEXT_PUBLIC_LOCAL_AUTH_PASSWORD
# `next build` collects route data by importing every API route, which
# imports auth.ts, which imports env.ts — whose assertEnv() throws if
# DATABASE_URL/BETTER_AUTH_SECRET/BETTER_AUTH_URL/BLOB_READ_WRITE_TOKEN are
# missing in a production build without LOCAL_MODE=true. So these all need
# to exist at build time too (as placeholders; nothing actually connects
# during the build), not just at container runtime via docker-compose.yml's
# `env_file`. These never reach the final runner stage below, which gets its
# real values from `.env.docker`.
ARG LOCAL_MODE
ARG DATABASE_URL="postgres://placeholder:placeholder@localhost:5432/placeholder"
ARG BETTER_AUTH_SECRET="placeholder-build-time-secret"
ARG BETTER_AUTH_URL="http://localhost:3000"
ARG BLOB_READ_WRITE_TOKEN="placeholder"
ENV LOCAL_MODE=$LOCAL_MODE
ENV DATABASE_URL=$DATABASE_URL
ENV BETTER_AUTH_SECRET=$BETTER_AUTH_SECRET
ENV BETTER_AUTH_URL=$BETTER_AUTH_URL
ENV BLOB_READ_WRITE_TOKEN=$BLOB_READ_WRITE_TOKEN
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# Runs `drizzle-kit push` + the local user seed script against the local
# Postgres container before the app starts. Needs devDependencies
# (drizzle-kit, tsx), which the standalone runner image below doesn't have.
# Only used by CI (docker-publish.yml) and docker-compose.prebuilt.yml —
# local docker-compose.yml runs the same command from the `dev` image above.
FROM node:24-alpine AS migrator
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json drizzle.config.ts tsconfig.json ./
COPY src ./src
COPY scripts ./scripts
CMD ["sh", "-c", "npx drizzle-kit push --force && npx tsx scripts/seed-local-user.ts"]

FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
# Only needed for LOCAL_MODE's docx->pdf conversion (see src/lib/docx-to-pdf.ts),
# which shells out to `soffice` instead of booting a Vercel Sandbox.
# font-noto-cjk is required too — without it, LibreOffice has no glyphs for
# CJK templates and renders that text as tofu boxes in the generated PDF.
# font-noto covers everything else Times New Roman falls back to when it's
# not installed (e.g. Lithuanian/Baltic ogonek letters į, ų), which
# otherwise render as tofu boxes the same way.
# font-liberation and font-carlito are metric-compatible replacements for
# Arial/Times New Roman/Courier New and Calibri — the fonts most .docx
# templates actually use. Without them LibreOffice substitutes a font with
# different glyph widths, so generated PDFs wrap/paginate differently than
# the same document opened in Word.
# Caladea is the metric-compatible Cambria replacement (equivalent to
# google-crosextra-caladea-fonts used on the Fedora/sandbox path). Alpine
# has no package for it, so we download it directly from Google Fonts.
# Without it, LibreOffice falls back to Noto Serif, whose wider glyphs cause
# lines to overflow their layout boxes — producing the garbled/overlapping
# text corruption visible in the local preview.
RUN apk add --no-cache libreoffice font-noto-cjk font-noto font-liberation font-carlito curl \
 && mkdir -p /usr/share/fonts/caladea \
 && curl -sL "https://github.com/google/fonts/raw/main/ofl/caladea/Caladea-Regular.ttf"  -o /usr/share/fonts/caladea/Caladea-Regular.ttf \
 && curl -sL "https://github.com/google/fonts/raw/main/ofl/caladea/Caladea-Bold.ttf"     -o /usr/share/fonts/caladea/Caladea-Bold.ttf \
 && curl -sL "https://github.com/google/fonts/raw/main/ofl/caladea/Caladea-Italic.ttf"   -o /usr/share/fonts/caladea/Caladea-Italic.ttf \
 && curl -sL "https://github.com/google/fonts/raw/main/ofl/caladea/Caladea-BoldItalic.ttf" -o /usr/share/fonts/caladea/Caladea-BoldItalic.ttf \
 && fc-cache -f /usr/share/fonts/caladea
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

EXPOSE 3000
ENV PORT=3000
CMD ["node", "server.js"]
