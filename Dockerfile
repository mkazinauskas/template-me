FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS builder
WORKDIR /app
# NEXT_PUBLIC_* vars are inlined into the client bundle at build time, so
# they have to arrive as build args, not just runtime env — see
# docker-compose.yml's `build.args` for the app service.
ARG NEXT_PUBLIC_LOCAL_MODE
ARG NEXT_PUBLIC_LOCAL_AUTH_EMAIL
ARG NEXT_PUBLIC_LOCAL_AUTH_PASSWORD
ENV NEXT_PUBLIC_LOCAL_MODE=$NEXT_PUBLIC_LOCAL_MODE
ENV NEXT_PUBLIC_LOCAL_AUTH_EMAIL=$NEXT_PUBLIC_LOCAL_AUTH_EMAIL
ENV NEXT_PUBLIC_LOCAL_AUTH_PASSWORD=$NEXT_PUBLIC_LOCAL_AUTH_PASSWORD
# `next build` collects route data by importing every API route, which
# imports auth.ts, which builds a database connection at module scope — so
# LOCAL_MODE/DATABASE_URL need to exist at build time too (as a placeholder;
# nothing actually connects during the build), not just at container
# runtime via docker-compose.yml's `env_file`. These never reach the final
# runner stage below, which gets its real values from `.env.docker`.
ARG LOCAL_MODE
ARG DATABASE_URL="postgres://placeholder:placeholder@localhost:5432/placeholder"
ENV LOCAL_MODE=$LOCAL_MODE
ENV DATABASE_URL=$DATABASE_URL
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# Runs `drizzle-kit push` + the local user seed script against the local
# Postgres container before the app starts. Needs devDependencies
# (drizzle-kit, tsx), which the standalone runner image below doesn't have.
FROM node:22-alpine AS migrator
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json drizzle.config.ts tsconfig.json ./
COPY src ./src
COPY scripts ./scripts
CMD ["sh", "-c", "npx drizzle-kit push --force && npx tsx scripts/seed-local-user.ts"]

FROM node:22-alpine AS runner
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
