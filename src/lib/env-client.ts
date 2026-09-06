import { z } from "zod";

/**
 * The browser half of the environment — the `NEXT_PUBLIC_*` vars, validated
 * at module load. Server vars live in src/lib/env.ts and never reach the
 * client bundle; this file is the only env module a client component may
 * import (see the `no-restricted-syntax` rule in eslint.config.mjs, which
 * keeps everything else off `process.env` entirely).
 *
 * Next.js only inlines a `NEXT_PUBLIC_*` var into the client bundle when the
 * source spells it out as a literal `process.env.NEXT_PUBLIC_X` member
 * expression — a loop over key names or `process.env[key]` is left untouched
 * and arrives as `undefined` in the browser. Hence the explicit object
 * literal below. `|| undefined` maps the empty string a valueless Docker
 * `ARG` produces onto "not set", so the schema defaults apply.
 *
 * These values are frozen into the bundle at build time, so a container
 * promoted between environments carries whatever `next build` saw — see the
 * NEXT_PUBLIC_* build args in Dockerfile.
 */
const clientSchema = z.object({
  // Same "exactly the string `true`" convention as the server flags in env.ts.
  NEXT_PUBLIC_LOCAL_MODE: z
    .string()
    .optional()
    .transform((value) => value === "true"),
  NEXT_PUBLIC_LOCAL_AUTH_EMAIL: z.string().default(""),
  /**
   * Dev-only, and inlined into the bundle every visitor downloads — so a
   * production build without LOCAL_MODE=true must never have it set. That
   * check can't live here (the client can't refuse its own build); env.ts
   * enforces it on the server at build and startup time.
   */
  NEXT_PUBLIC_LOCAL_AUTH_PASSWORD: z.string().default(""),
});

export const clientEnv = clientSchema.parse({
  NEXT_PUBLIC_LOCAL_MODE: process.env.NEXT_PUBLIC_LOCAL_MODE || undefined,
  NEXT_PUBLIC_LOCAL_AUTH_EMAIL: process.env.NEXT_PUBLIC_LOCAL_AUTH_EMAIL || undefined,
  NEXT_PUBLIC_LOCAL_AUTH_PASSWORD: process.env.NEXT_PUBLIC_LOCAL_AUTH_PASSWORD || undefined,
});
