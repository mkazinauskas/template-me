import { env } from "@/lib/env";

/**
 * Google OAuth credentials, or `undefined` when this deployment has none.
 *
 * Server-only (it reads server env), and deliberately the single source of
 * truth for "is Google sign-in available here?": src/lib/auth.ts uses it to
 * decide whether to register the provider at all, and the sign-in/sign-up
 * pages use {@link isGoogleAuthEnabled} to decide whether to render the
 * button. Splitting those two decisions is how you end up with a button that
 * leads nowhere — or a working provider nobody can see.
 *
 * A function rather than a module-level constant because `env` re-reads
 * `process.env` on every access by design (see src/lib/env.ts).
 *
 * env.ts rejects a half-configured pair at startup, so in practice either
 * both credentials are present or neither is; the `&&` here is what lets
 * TypeScript narrow them to `string`.
 */
export function googleCredentials(): { clientId: string; clientSecret: string } | undefined {
  const clientId = env.GOOGLE_CLIENT_ID;
  const clientSecret = env.GOOGLE_CLIENT_SECRET;
  return clientId && clientSecret ? { clientId, clientSecret } : undefined;
}

/** Whether to offer "Continue with Google" in the UI. */
export function isGoogleAuthEnabled(): boolean {
  return googleCredentials() !== undefined;
}
