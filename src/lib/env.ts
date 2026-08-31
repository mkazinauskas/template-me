/**
 * Fails fast on a misconfigured deployment instead of surfacing deep, opaque
 * errors the first time some route touches the missing env var (e.g. a
 * Postgres client throwing on an undefined connection string). Imported at
 * the top of src/lib/auth.ts so it runs as soon as that module — which every
 * auth-touching route pulls in — is loaded.
 *
 * Local Docker Compose (LOCAL_MODE=true) is exempt: it uses a seeded local
 * user, a local Postgres container, and local-disk blob storage instead of
 * the vars below (see src/db/index.ts, src/lib/storage.ts,
 * src/components/auth-form.tsx).
 */

const isProduction = process.env.NODE_ENV === "production";
const isLocalMode = process.env.LOCAL_MODE === "true";

function assertEnv() {
  if (!isProduction || isLocalMode) return;

  const missing: string[] = [];
  if (!process.env.DATABASE_URL) missing.push("DATABASE_URL");
  if (!process.env.BETTER_AUTH_SECRET) missing.push("BETTER_AUTH_SECRET");
  // Mirrors src/lib/auth.ts's baseURL precedence: VERCEL_PROJECT_PRODUCTION_URL,
  // then VERCEL_URL (set automatically on every Vercel deployment), then
  // BETTER_AUTH_URL — so BETTER_AUTH_URL is only load-bearing when VERCEL_URL
  // is absent (i.e. not running on Vercel).
  if (!process.env.VERCEL_URL && !process.env.BETTER_AUTH_URL) missing.push("BETTER_AUTH_URL");
  // @vercel/blob reads this exact var name itself (see its putFile/get/del
  // calls in src/lib/storage.ts) — there's no app-level alias for it.
  if (!process.env.BLOB_READ_WRITE_TOKEN) missing.push("BLOB_READ_WRITE_TOKEN");

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variable(s): ${missing.join(", ")}. ` +
        "Set these before starting the app, or set LOCAL_MODE=true for local development."
    );
  }

  // NEXT_PUBLIC_* vars are inlined into the client bundle at build time, so
  // this dev-only password (used by AuthForm's LOCAL_MODE branch — see
  // src/components/auth-form.tsx) must never be set for a real production
  // deployment, where it would ship a working credential to every visitor.
  if (process.env.NEXT_PUBLIC_LOCAL_AUTH_PASSWORD) {
    throw new Error(
      "NEXT_PUBLIC_LOCAL_AUTH_PASSWORD is set but this is a production build without LOCAL_MODE=true. " +
        "This dev-only password is exposed to the client bundle and must not be set in production."
    );
  }
}

assertEnv();
