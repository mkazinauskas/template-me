// Overwritten during the Vercel build by scripts/write-libreoffice-snapshot.ts
// with the ID of a snapshot built fresh from the current LO_DEPS in
// src/lib/libreoffice-deps.ts — so the fonts/deps this deployment's code
// expects and the ones actually baked into the sandbox it boots can never
// drift apart. Left as `undefined` for local dev / non-Vercel builds, in
// which case docx-to-pdf.ts falls back to LIBREOFFICE_SANDBOX_SNAPSHOT_ID
// (if set) or a from-scratch install.
export const LIBREOFFICE_SNAPSHOT_ID: string | undefined = undefined;
