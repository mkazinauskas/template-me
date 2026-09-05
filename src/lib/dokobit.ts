import { createHash } from "node:crypto";
import { createFakeSigning } from "@/lib/dokobit/fake";

/**
 * Client for Dokobit's Documents Gateway API — the service that collects
 * qualified e-signatures (Mobile ID / Smart-ID / ID card) in LT, LV, EE and
 * elsewhere. See https://gateway-sandbox.dokobit.com/api/doc.
 *
 * Sending a filled document for signature is three calls, not one:
 *   1. POST /api/file/upload.json          — hand over the bytes, get a file token
 *   2. GET  /api/file/upload/{token}/status.json — wait for "uploaded"
 *   3. POST /api/signing/create.json       — create the signing, get a signer token
 *
 * The signer is invited by Dokobit itself: passing `signers[0][email]` is what
 * makes it send the invitation mail, so the app never has to deliver the
 * signing link (though {@link createSigning} returns it too, so the caller can
 * show or re-send it).
 *
 * Endpoints take form-encoded bodies with PHP-style bracket keys
 * (`signers[0][name]`) and answer with JSON — the `.json` suffix describes the
 * response, not the request.
 *
 * In LOCAL_MODE with no access token, {@link createSigning} hands off to the
 * simulated gateway in `./dokobit/fake` instead — same signature, no network
 * call, no account needed. This mirrors how storage and PDF conversion already
 * swap in local stand-ins under LOCAL_MODE.
 */

const DEFAULT_API_URL = "https://gateway.dokobit.com";
const DEFAULT_SIGNING_TYPE = "pdf";
const DEFAULT_LANGUAGE = "lt";

// Uploads are processed asynchronously, so step 2 above polls. A filled
// template is a handful of pages, which settles well inside this budget.
const UPLOAD_POLL_INTERVAL_MS = 500;
const UPLOAD_POLL_TIMEOUT_MS = 20_000;

export type DokobitSigner = {
  email: string;
  name: string;
  surname: string;
};

export type DokobitSigning = {
  /** Identifies the signing session in Dokobit; also the postback key. */
  signingToken: string;
  /** Personal, token-bearing URL this signer uses to sign. Treat as a secret. */
  signingUrl: string;
};

/** A failure reported by (or while talking to) Dokobit, safe to show a user. */
export class DokobitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DokobitError";
  }
}

/**
 * Whether signing runs against the simulated gateway: local development with
 * no real credentials to talk to. A token always wins, so a LOCAL_MODE stack
 * can still be pointed at Dokobit's sandbox by setting one.
 */
export function isFakeDokobit(): boolean {
  return process.env.LOCAL_MODE === "true" && !process.env.DOKOBIT_ACCESS_TOKEN;
}

/**
 * Whether to offer signing at all — real credentials, or the local fake
 * standing in for them.
 */
export function isDokobitConfigured(): boolean {
  return Boolean(process.env.DOKOBIT_ACCESS_TOKEN) || isFakeDokobit();
}

function config() {
  const accessToken = process.env.DOKOBIT_ACCESS_TOKEN;
  if (!accessToken) {
    throw new DokobitError("Document signing is not configured on this server");
  }
  return {
    accessToken,
    // Sandbox is https://gateway-sandbox.dokobit.com — a different host with
    // its own tokens, so it's swapped by env rather than by a boolean flag.
    apiUrl: (process.env.DOKOBIT_API_URL || DEFAULT_API_URL).replace(/\/+$/, ""),
    // "pdf" is a plain PAdES signature; "pdflt" is the Lithuanian flavour that
    // some institutions require. Both take the same parameters here.
    signingType: process.env.DOKOBIT_SIGNING_TYPE || DEFAULT_SIGNING_TYPE,
    language: process.env.DOKOBIT_LANGUAGE || DEFAULT_LANGUAGE,
  };
}

type DokobitResponse = Record<string, unknown> & { status?: unknown };

/**
 * Calls one Gateway endpoint and returns its parsed body, turning both
 * transport failures and `{"status":"error"}` payloads into {@link DokobitError}.
 *
 * `path` is used for error messages; the access token rides in the query string
 * and is deliberately never interpolated into anything thrown from here.
 */
async function request(
  path: string,
  { accessToken, apiUrl }: { accessToken: string; apiUrl: string },
  body?: URLSearchParams
): Promise<DokobitResponse> {
  const url = `${apiUrl}${path}?access_token=${encodeURIComponent(accessToken)}`;

  let res: Response;
  try {
    res = await fetch(url, {
      method: body ? "POST" : "GET",
      headers: body
        ? { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" }
        : { Accept: "application/json" },
      body,
    });
  } catch {
    throw new DokobitError("Could not reach the Dokobit signing service");
  }

  const text = await res.text();
  let json: DokobitResponse;
  try {
    json = JSON.parse(text) as DokobitResponse;
  } catch {
    throw new DokobitError(
      `Dokobit returned an unreadable response for ${path} (HTTP ${res.status})`
    );
  }

  if (!res.ok || (typeof json.status === "string" && json.status === "error")) {
    throw new DokobitError(dokobitErrorMessage(json, res.status));
  }
  return json;
}

/**
 * Flattens Dokobit's error payload into one line. Failures come back either as
 * a top-level `message`, or as an `errors` map keyed by the offending
 * parameter (`{"signers[0][email]": ["This value is not a valid email."]}`).
 */
function dokobitErrorMessage(json: DokobitResponse, httpStatus: number): string {
  if (typeof json.message === "string" && json.message) return json.message;

  const errors = json.errors;
  if (errors && typeof errors === "object") {
    const parts = Object.entries(errors as Record<string, unknown>).map(([field, value]) => {
      const detail = Array.isArray(value) ? value.join(" ") : String(value);
      return `${field}: ${detail}`;
    });
    if (parts.length > 0) return `Dokobit rejected the request — ${parts.join("; ")}`;
  }
  return `Dokobit rejected the request (HTTP ${httpStatus})`;
}

function requireToken(json: DokobitResponse, path: string): string {
  const token = json.token;
  if (typeof token !== "string" || !token) {
    throw new DokobitError(`Dokobit did not return a token for ${path}`);
  }
  return token;
}

/** Step 1 + 2: hands the bytes over and waits until Dokobit reports them stored. */
async function uploadFile(
  pdf: Buffer,
  filename: string,
  cfg: ReturnType<typeof config>
): Promise<string> {
  const body = new URLSearchParams({
    "file[name]": filename,
    // SHA256 hex of the content; Dokobit verifies it against what it receives.
    "file[digest]": createHash("sha256").update(pdf).digest("hex"),
    "file[content]": pdf.toString("base64"),
  });

  const token = requireToken(await request("/api/file/upload.json", cfg, body), "file upload");
  await waitForUpload(token, cfg);
  return token;
}

async function waitForUpload(token: string, cfg: ReturnType<typeof config>): Promise<void> {
  const deadline = Date.now() + UPLOAD_POLL_TIMEOUT_MS;
  const path = `/api/file/upload/${encodeURIComponent(token)}/status.json`;

  for (;;) {
    const json = await request(path, cfg);
    const status = typeof json.status === "string" ? json.status : "";

    if (status === "uploaded") return;
    if (status !== "pending") {
      throw new DokobitError(
        `Dokobit could not store the document (upload status: ${status || "unknown"})`
      );
    }
    if (Date.now() >= deadline) {
      throw new DokobitError("Dokobit did not finish storing the document in time");
    }
    await new Promise((resolve) => setTimeout(resolve, UPLOAD_POLL_INTERVAL_MS));
  }
}

/**
 * Uploads `pdf` to Dokobit and opens a signing for a single signer, who is
 * invited by email. Returns that signer's personal signing URL.
 *
 * `signerId` must be unique per signer within the signing; the caller passes a
 * value it can correlate later (postbacks echo it back).
 */
export async function createSigning({
  pdf,
  filename,
  signingName,
  signer,
  signerId,
}: {
  pdf: Buffer;
  filename: string;
  signingName: string;
  signer: DokobitSigner;
  signerId: string;
}): Promise<DokobitSigning> {
  if (isFakeDokobit()) {
    return createFakeSigning({ pdf, filename, signingName, signer });
  }

  const cfg = config();
  const fileToken = await uploadFile(pdf, filename, cfg);

  const body = new URLSearchParams({
    type: cfg.signingType,
    name: signingName,
    language: cfg.language,
    "signers[0][id]": signerId,
    "signers[0][name]": signer.name,
    "signers[0][surname]": signer.surname,
    // Supplying an email is what makes Dokobit mail the invitation.
    "signers[0][email]": signer.email,
    "signers[0][notifications_language]": cfg.language,
    // Required by the pdf/pdflt document types.
    "signers[0][signing_purpose]": "signature",
    "files[0][token]": fileToken,
  });

  const json = await request("/api/signing/create.json", cfg, body);
  const signingToken = requireToken(json, "signing create");

  // `signers` maps each signer id we sent to that signer's own access token.
  const signers = json.signers;
  const signerToken =
    signers && typeof signers === "object"
      ? (signers as Record<string, unknown>)[signerId]
      : undefined;
  if (typeof signerToken !== "string" || !signerToken) {
    throw new DokobitError("Dokobit did not return a signing link for this signer");
  }

  return {
    signingToken,
    signingUrl: `${cfg.apiUrl}/signing/${encodeURIComponent(signingToken)}?access_token=${encodeURIComponent(signerToken)}`,
  };
}
