/**
 * Next.js calls `register()` once per server instance — `next dev`, `next
 * start`, and each serverless/Fluid Compute instance on Vercel — and waits
 * for it to finish before the server accepts requests. Validating the
 * environment here means a misconfigured deployment fails at startup with a
 * message naming the offending vars, rather than at whichever request first
 * touches one.
 *
 * The import lives inside `register` (per the Next.js instrumentation guide)
 * so the side effect stays colocated with the call rather than firing from a
 * top-level import.
 */
export async function register() {
  const { validateEnv } = await import("@/lib/env");
  validateEnv();
}
