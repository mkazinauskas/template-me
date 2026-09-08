import { clientIp } from "@/lib/rate-limit";

/**
 * Structured audit logging for sign-in attempts.
 *
 * Until now a brute-force attempt against this app left no trace: the rate
 * limiter (see auth.ts) silently returns 429s and better-auth's own logger says
 * nothing about a wrong OTP, so "is someone hammering this account?" had no
 * answer. These lines go to stdout as single-line JSON, which is what Vercel's
 * runtime logs and log drains ingest, so they can be filtered on `tag` and
 * alerted on without any schema or retention work in this app.
 *
 * Deliberately NOT a database table: an audit trail that writes a row on every
 * sign-in attempt is exactly what an attacker floods, turning the log into the
 * amplification target. stdout has no such failure mode.
 *
 * Known gap: rate-limit rejections never reach here. better-auth answers those
 * with a 429 before it dispatches to an endpoint, so no `after` hook runs — a
 * throttled attacker shows up as a *gap* in these lines rather than a burst of
 * them, which is worth knowing when reading them.
 */

/** Log line tag, for filtering in a drain (`tag:"auth-event"`). */
const TAG = "auth-event";

/** Paths worth a line. Anything else (session reads, sign-out) is noise. */
const WATCHED_PATHS: Record<string, AuthEventName> = {
  "/sign-in/email-otp": "sign_in",
  // Only reachable in LOCAL_MODE — see `emailAndPassword` in auth.ts.
  "/sign-in/email": "sign_in",
  // Not an authentication attempt itself, but a burst of these across many
  // addresses is account enumeration, which is worth being able to see.
  "/email-otp/send-verification-otp": "otp_requested",
  // Where a Google sign-in actually completes. `/sign-in/social` is not
  // audited: it only hands the browser a URL to Google and proves nothing
  // about who is signing in. The callback carries no email in its body — the
  // address lives in the OAuth code — so these lines identify the account by
  // `userId` alone.
  "/callback/google": "sign_in",
};

type AuthEventName = "sign_in" | "otp_requested";

export type AuthEvent = {
  tag: typeof TAG;
  event: AuthEventName;
  outcome: "success" | "failure";
  path: string;
  ip: string;
  /**
   * Logged in full rather than hashed: an audit line whose subject can't be
   * identified can't answer the question it exists for ("who is being targeted,
   * and is it one account or thousands?"). It is the same address already
   * stored in the `user` table, and these logs sit behind Vercel project
   * access. Nothing else from the request body is ever included — in
   * particular the submitted OTP and password are never logged.
   */
  email?: string;
  userId?: string;
  status?: number;
  /** better-auth's error code (e.g. `TOO_MANY_ATTEMPTS`), when the attempt failed. */
  code?: string;
};

/** The subset of a better-auth `after` hook context this needs. */
export type AuthHookInput = {
  path: string;
  body?: unknown;
  headers?: Headers;
  /** `ctx.context.returned` — the endpoint's value, or an APIError when it failed. */
  returned?: unknown;
  /** `ctx.context.newSession` — only present once a session actually exists. */
  newSession?: { user?: { id?: string } } | null;
};

/**
 * The `?error=<code>` a redirect carries in its `location` header, if any.
 *
 * This is the only place the OAuth callback reports why it failed — unlike the
 * OTP endpoints, it puts no code in a response body, it redirects the browser
 * to the error URL with the code in the query string.
 */
function redirectErrorCode(returned: unknown): string | undefined {
  const headers = (returned as { headers?: unknown })?.headers;
  const location = headers instanceof Headers ? headers.get("location") : undefined;
  if (!location) return undefined;
  try {
    // `location` may be absolute or relative; the base only satisfies the
    // parser for the relative case and never appears in the result.
    return new URL(location, "http://redirect.invalid").searchParams.get("error") ?? undefined;
  } catch {
    return undefined;
  }
}

function readString(source: unknown, key: string): string | undefined {
  if (typeof source !== "object" || source === null) return undefined;
  const value = (source as Record<string, unknown>)[key];
  return typeof value === "string" ? value : undefined;
}

/**
 * Builds the event for one auth request, or `null` when the path isn't one we
 * audit. Kept pure and separate from the emitting below so the classification —
 * which is the part with the security meaning — is unit-testable without
 * standing up better-auth.
 */
export function toAuthEvent(input: AuthHookInput): AuthEvent | null {
  const event = WATCHED_PATHS[input.path];
  if (!event) return null;

  // A failed endpoint puts an APIError in `returned` rather than throwing (see
  // better-auth's dispatch.mjs), so a numeric 4xx/5xx `statusCode` is what
  // marks a failure. A success returns its own payload, which carries no
  // `statusCode` at all — so "no status" means success, not "unknown".
  const status = typeof (input.returned as { statusCode?: unknown })?.statusCode === "number"
    ? (input.returned as { statusCode: number }).statusCode
    : undefined;
  const userId = input.newSession?.user?.id;

  // ...except on the OAuth callback, where the status code says nothing about
  // the outcome: `c.redirect()` builds a 302 APIError and the callback throws
  // one on *both* paths — the hop to `callbackURL` when sign-in worked, and the
  // hop to the error URL when it didn't. Reading 302 as "not >= 400" would log
  // every rejected Google sign-in as a success. A session is what separates
  // them: `setSessionCookie()` is the last thing the callback does before
  // redirecting on success, and it is what populates `newSession`.
  const isRedirect = status !== undefined && status >= 300 && status < 400;
  const failed = (status !== undefined && status >= 400) || (isRedirect && !userId);

  return {
    tag: TAG,
    event,
    outcome: failed ? "failure" : "success",
    path: input.path,
    ip: clientIp(input.headers ?? new Headers()),
    email: readString(input.body, "email"),
    userId,
    status,
    code:
      readString((input.returned as { body?: unknown })?.body, "code") ??
      redirectErrorCode(input.returned),
  };
}

/**
 * Emits the event for one auth request. Never throws: this runs inside the
 * request path of every sign-in, so a logging bug must not be able to take
 * authentication down with it.
 */
export function logAuthEvent(input: AuthHookInput): void {
  try {
    const event = toAuthEvent(input);
    if (!event) return;
    // console.error so failures survive a log level that drops info lines, and
    // so they sort into the same bucket an alert would already be watching.
    const write = event.outcome === "failure" ? console.error : console.info;
    write(JSON.stringify(event));
  } catch {
    // Intentionally swallowed — see above.
  }
}
