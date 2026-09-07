import { z } from "zod";

/**
 * The server half of this app's environment: one schema declaring every
 * variable the server reads, its type, its default, and which are required
 * where. The browser half — the `NEXT_PUBLIC_*` vars — lives in
 * src/lib/env-client.ts, which is the only env module a client component may
 * import; nothing here ever reaches the client bundle.
 *
 * Between them the two files are the only place this app touches
 * `process.env`, enforced by the `no-restricted-syntax` rule in
 * eslint.config.mjs.
 *
 * Validation runs on every startup: at import time on the server (this module
 * is pulled in by auth.ts, the db client, storage, etc.) and again explicitly
 * from `register()` in src/instrumentation.ts, which Next.js calls once per
 * server instance before it handles any request. A misconfigured deployment
 * therefore fails immediately and says exactly what is missing, instead of
 * surfacing a deep, opaque error the first time some route touches the var
 * (e.g. a Postgres client throwing on an undefined connection string).
 *
 * Scope: everything the app itself runs on. Tooling configs loaded outside
 * the app by their own runner — next.config.ts, playwright.config.ts, and the
 * Playwright specs under e2e/ — keep reading `process.env` directly, since
 * they are evaluated before (or entirely without) the app.
 *
 * Local Docker Compose (LOCAL_MODE=true) is exempt from the production
 * requirements below: it uses a seeded local user, a local Postgres
 * container, and local-disk blob storage instead of those vars (see
 * src/db/index.ts, src/lib/storage.ts, src/components/auth-form.tsx).
 */

/**
 * `LOCAL_MODE=true`-style flags. Anything other than the exact string "true"
 * is false — the convention every call site used before this file existed.
 */
const flag = z
  .string()
  .optional()
  .transform((value) => value === "true");

const serverObject = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  // --- deployment mode -----------------------------------------------------
  LOCAL_MODE: flag,
  /**
   * Opens `POST /api/auth/sign-up/email`. Only ever set by
   * scripts/seed-local-user.ts, in its own process — never by the web server
   * (see src/lib/auth.ts).
   */
  LOCAL_ALLOW_SIGNUP: flag,
  LOCAL_STORAGE_DIR: z.string().min(1).default("/data/blobs"),

  // Credentials for the static account scripts/seed-local-user.ts creates.
  LOCAL_AUTH_EMAIL: z.email().default("demo@example.com"),
  LOCAL_AUTH_PASSWORD: z.string().min(1).default("localpassword123"),
  LOCAL_AUTH_NAME: z.string().min(1).default("Local User"),

  // --- cloud services ------------------------------------------------------
  DATABASE_URL: z.string().min(1).optional(),
  BETTER_AUTH_SECRET: z.string().min(1).optional(),
  BETTER_AUTH_URL: z.url().optional(),
  /** @vercel/blob reads this exact name itself — there is no app-level alias. */
  BLOB_READ_WRITE_TOKEN: z.string().min(1).optional(),

  // Set automatically on every Vercel deployment; bare hostnames, no scheme.
  VERCEL_URL: z.string().min(1).optional(),
  VERCEL_PROJECT_PRODUCTION_URL: z.string().min(1).optional(),

  RESEND_API_KEY: z.string().min(1).optional(),
  /** Resend accepts both `a@b.com` and `Name <a@b.com>`, so not `z.email()`. */
  RESEND_FROM_EMAIL: z.string().min(1).optional(),

  /**
   * Google OAuth credentials. Optional everywhere, including production —
   * "Continue with Google" is an *additional* way in, so a deployment with
   * neither var set simply doesn't offer it and keeps the email-code flow
   * (see src/lib/auth-providers.ts, which is the single place that decides
   * whether the provider is on).
   */
  GOOGLE_CLIENT_ID: z.string().min(1).optional(),
  GOOGLE_CLIENT_SECRET: z.string().min(1).optional(),

  /** Manual override for the snapshot baked in at build time (see src/lib/docx-to-pdf.ts). */
  LIBREOFFICE_SANDBOX_SNAPSHOT_ID: z.string().min(1).optional(),

  /**
   * The one `NEXT_PUBLIC_*` var this file declares, and it is validated
   * rather than consumed: it is inlined into the client bundle, so a
   * production build must never have it set, and only the server can refuse
   * a build. Read as a value from src/lib/env-client.ts.
   */
  NEXT_PUBLIC_LOCAL_AUTH_PASSWORD: z.string().min(1).optional(),
});

type ServerInput = z.infer<typeof serverObject>;

const SERVER_KEYS = Object.keys(serverObject.shape) as (keyof ServerInput)[];

/**
 * The site's public origin, with no trailing slash: Vercel's production
 * domain, then the current deployment URL, then an explicit override, then
 * localhost for dev. Derived here so better-auth's `baseURL` and the metadata
 * / sitemap / robots origin can't drift apart (see src/lib/site-url.ts).
 */
function resolveSiteUrl(value: ServerInput): string {
  const origin = value.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${value.VERCEL_PROJECT_PRODUCTION_URL}`
    : value.VERCEL_URL
      ? `https://${value.VERCEL_URL}`
      : (value.BETTER_AUTH_URL ?? "http://localhost:3000");
  return origin.replace(/\/+$/, "");
}

const serverSchema = serverObject
  .superRefine((value, ctx) => {
    const requiredInProduction = (key: keyof ServerInput, message: string) => {
      if (!value[key]) ctx.addIssue({ code: "custom", path: [key], message });
    };

    // Half-configured Google OAuth is worse than none: `auth-providers.ts`
    // would report the provider off and hide the button, so a deployment that
    // set only one of the pair would silently lose a sign-in method it thinks
    // it enabled. Fail the boot instead of debugging that from the UI.
    if (Boolean(value.GOOGLE_CLIENT_ID) !== Boolean(value.GOOGLE_CLIENT_SECRET)) {
      ctx.addIssue({
        code: "custom",
        path: [value.GOOGLE_CLIENT_ID ? "GOOGLE_CLIENT_SECRET" : "GOOGLE_CLIENT_ID"],
        message: "Required: GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set together.",
      });
    }

    if (value.NODE_ENV !== "production" || value.LOCAL_MODE) return;

    requiredInProduction("DATABASE_URL", "Required: the Postgres connection string.");
    requiredInProduction("BETTER_AUTH_SECRET", "Required: signs session cookies.");
    requiredInProduction("BLOB_READ_WRITE_TOKEN", "Required: the Vercel Blob store token.");
    // BETTER_AUTH_URL is only load-bearing when VERCEL_URL is absent (i.e. not
    // running on Vercel) — see `resolveSiteUrl` for the precedence.
    if (!value.VERCEL_URL) {
      requiredInProduction(
        "BETTER_AUTH_URL",
        "Required off Vercel: the site's public origin (on Vercel, VERCEL_URL is used instead)."
      );
    }

    // NEXT_PUBLIC_* vars are inlined into the client bundle at build time, so
    // this dev-only password (used by AuthForm's LOCAL_MODE branch — see
    // src/components/auth-form.tsx) must never be set for a real production
    // deployment, where it would ship a working credential to every visitor.
    if (value.NEXT_PUBLIC_LOCAL_AUTH_PASSWORD) {
      ctx.addIssue({
        code: "custom",
        path: ["NEXT_PUBLIC_LOCAL_AUTH_PASSWORD"],
        message:
          "Must not be set in a production build without LOCAL_MODE=true: this dev-only " +
          "password is exposed to the client bundle.",
      });
    }
  })
  .transform((value) => ({ ...value, SITE_URL: resolveSiteUrl(value) }));

export type Env = z.infer<typeof serverSchema>;

/** Anything shaped like `process.env` — the tests pass plain objects. */
type EnvSource = Record<string, string | undefined>;

/**
 * Docker's `ARG X` with no value sets `X` to the empty string, and every
 * call site treated "" as "not set" before this file existed — so normalize
 * it to `undefined` and let the schema's defaults/optionals apply.
 */
function readRaw(source: EnvSource): Record<string, string | undefined> {
  const raw: Record<string, string | undefined> = {};
  for (const key of SERVER_KEYS) {
    raw[key] = source[key] === "" ? undefined : source[key];
  }
  return raw;
}

function parseServerEnv(source: EnvSource = process.env): Env {
  const result = serverSchema.safeParse(readRaw(source));
  if (result.success) return result.data;
  throw new Error(
    `Invalid environment variables:\n${z.prettifyError(result.error)}\n` +
      "Set these before starting the app, or set LOCAL_MODE=true for local development."
  );
}

/**
 * Parses and validates the environment, throwing on the first problem.
 * Called at import time below and again from src/instrumentation.ts.
 */
export function validateEnv(source: EnvSource = process.env): Env {
  return parseServerEnv(source);
}

/**
 * The validated server environment.
 *
 * Every property read re-parses `process.env` rather than handing back a
 * snapshot taken at import time, because the environment is still mutated
 * after this module loads: scripts/seed-local-user.ts sets LOCAL_ALLOW_SIGNUP
 * before importing the auth instance, and the unit tests flip LOCAL_MODE
 * between cases. Parsing ~20 keys is microseconds and every call site here is
 * request- or startup-frequency, not a hot loop.
 *
 * Server-only: none of these vars exist in the browser. Client components
 * import `clientEnv` from src/lib/env-client.ts instead.
 */
export const env = new Proxy({} as Env, {
  get(_target, key) {
    if (typeof key !== "string") return undefined;
    return parseServerEnv()[key as keyof Env];
  },
  has(_target, key) {
    if (typeof key !== "string") return false;
    return key === "SITE_URL" || SERVER_KEYS.includes(key as keyof ServerInput);
  },
  ownKeys() {
    return [...SERVER_KEYS, "SITE_URL"];
  },
  getOwnPropertyDescriptor() {
    return { enumerable: true, configurable: true };
  },
});

// Fail fast on the server as soon as anything imports this module — which
// covers `next build`, the scripts under scripts/, and every server start,
// including runtimes that never call instrumentation's `register()`. The
// `window` guard is belt-and-braces — no client component imports this module
// — and it also skips the parse under jsdom in the unit tests, which is
// harmless: `validateEnv` is tested directly.
if (typeof window === "undefined") {
  validateEnv();
}
