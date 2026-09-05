import { nanoid } from "nanoid";
import { getFile, localFileUrl, putFile } from "@/lib/storage";
import { siteUrl } from "@/lib/site-url";

/**
 * A stand-in for Dokobit's Documents Gateway, used when the app runs in
 * LOCAL_MODE without real gateway credentials (see `@/lib/dokobit`). Instead
 * of calling out, it files the rendered PDF away under `dokobit/` in local
 * storage and hands back a link to `/fake-dokobit/{token}` — a dev-only page
 * that shows the document and lets you "sign" it, so the whole flow can be
 * clicked through with no Dokobit account.
 *
 * This module must never run in a real deployment; `@/lib/dokobit` is the only
 * caller and gates every entry point on LOCAL_MODE.
 */

const STORAGE_PREFIX = "dokobit";
const TOKEN_LENGTH = 20;

// nanoid's alphabet, which is URL-safe and contains no path separators. Tokens
// arrive here from a URL segment, so they're re-checked against it before ever
// becoming part of a storage pathname.
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

export type FakeSigning = {
  token: string;
  filename: string;
  signingName: string;
  signer: { email: string; name: string; surname: string };
  createdAt: string;
  /** ISO timestamp of the simulated signature, or null while still pending. */
  signedAt: string | null;
};

function metaPath(token: string) {
  return `${STORAGE_PREFIX}/${token}.json`;
}

function pdfPath(token: string) {
  return `${STORAGE_PREFIX}/${token}.pdf`;
}

async function writeMeta(signing: FakeSigning): Promise<void> {
  await putFile(
    metaPath(signing.token),
    Buffer.from(JSON.stringify(signing, null, 2)),
    "application/json"
  );
}

/**
 * Files a rendered PDF away as a pending simulated signing and returns the
 * link to its page, mirroring what `createSigning` returns for the real
 * gateway.
 */
export async function createFakeSigning({
  pdf,
  filename,
  signingName,
  signer,
}: {
  pdf: Buffer;
  filename: string;
  signingName: string;
  signer: { email: string; name: string; surname: string };
}): Promise<{ signingToken: string; signingUrl: string }> {
  const token = nanoid(TOKEN_LENGTH);

  await putFile(pdfPath(token), pdf, "application/pdf");
  await writeMeta({
    token,
    filename,
    signingName,
    signer,
    createdAt: new Date().toISOString(),
    signedAt: null,
  });

  // The real gateway would be emailing the signer at this point, so say so —
  // otherwise the fake silently swallows the only externally visible effect.
  console.log(
    `[fake-dokobit] signing created — no email sent, no document left this machine\n` +
      `  signer:   ${signer.name} ${signer.surname} <${signer.email}>\n` +
      `  document: ${filename} (${pdf.length} bytes)\n` +
      `  sign at:  ${siteUrl}/fake-dokobit/${token}`
  );

  return { signingToken: token, signingUrl: `${siteUrl}/fake-dokobit/${token}` };
}

/** Reads one simulated signing's metadata, or null if the token is unknown. */
export async function readFakeSigning(token: string): Promise<FakeSigning | null> {
  if (!TOKEN_PATTERN.test(token)) return null;
  const file = await getFile(localFileUrl(metaPath(token)));
  if (!file) return null;
  try {
    return JSON.parse(file.toString()) as FakeSigning;
  } catch {
    return null;
  }
}

/** Reads the stored PDF for one simulated signing, or null if the token is unknown. */
export async function readFakeSigningPdf(token: string): Promise<Buffer | null> {
  if (!TOKEN_PATTERN.test(token)) return null;
  return getFile(localFileUrl(pdfPath(token)));
}

/**
 * Marks a simulated signing as signed. Already-signed signings keep their
 * original timestamp, so re-submitting is a no-op rather than an error — the
 * real gateway rejects a second signature too.
 */
export async function signFakeSigning(token: string): Promise<FakeSigning | null> {
  const signing = await readFakeSigning(token);
  if (!signing) return null;
  if (signing.signedAt) return signing;

  const signed = { ...signing, signedAt: new Date().toISOString() };
  await writeMeta(signed);
  console.log(`[fake-dokobit] signed — ${signed.filename} by <${signed.signer.email}>`);
  return signed;
}
