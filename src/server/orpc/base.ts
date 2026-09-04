import { ORPCError, os } from "@orpc/server";
import { auth } from "@/lib/auth";

/**
 * Session shape as returned by better-auth. `getSession` resolves to `null`
 * for an anonymous caller.
 */
export type Session = Awaited<ReturnType<typeof auth.api.getSession>>;

/**
 * Initial context every procedure starts from — just the incoming request
 * headers, forwarded by the Next.js route handler (see
 * `src/app/api/rpc/[[...rest]]/route.ts`). The session is resolved from these
 * by the `withSession` middleware below rather than being passed in.
 */
export type BaseContext = { headers: Headers };

const base = os.$context<BaseContext>();

/** Resolves the better-auth session (possibly `null`) onto the context. */
const withSession = base.middleware(async ({ context, next }) => {
  const session = await auth.api.getSession({ headers: context.headers });
  return next({ context: { session } });
});

/**
 * Base for endpoints anyone may call (signed in or not) — e.g. viewing or
 * generating from a public template. `context.session` may be `null`.
 */
export const publicProcedure = base.use(withSession);

/**
 * Base for endpoints that require a signed-in user. Throws `UNAUTHORIZED`
 * (HTTP 401) when there is no session, and narrows `context.session` to
 * non-null for the handler.
 */
export const protectedProcedure = publicProcedure.use(async ({ context, next }) => {
  if (!context.session) {
    throw new ORPCError("UNAUTHORIZED", { message: "Unauthorized" });
  }
  return next({ context: { session: context.session } });
});
