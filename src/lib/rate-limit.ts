import { eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { rateLimit } from "@/db/schema";

/**
 * Minimal database-backed sliding-window rate limiter for routes outside
 * better-auth's own request handling (better-auth's built-in rate limiter
 * — see auth.ts — only ever runs for requests it dispatches itself, under
 * its own base path, so it can't be reused for arbitrary app routes like
 * generate/route.ts). Backed by Postgres — not an in-memory Map — so the
 * limit holds across Vercel's multiple serverless instances.
 *
 * Reuses the same `rateLimit` table better-auth's own database-storage rate
 * limiter writes to (see db/schema.ts), just under a distinct key namespace
 * (callers should prefix keys, e.g. `generate:${userId}`) so the two never
 * collide.
 *
 * The upsert below is a single atomic statement: `INSERT ... ON CONFLICT ...
 * DO UPDATE ... WHERE ...`. Postgres locks the conflicting row for the
 * duration of the statement, so concurrent requests for the same key can't
 * both read a stale count and both be allowed through.
 */
/**
 * Headers to read the client address from, most trustworthy first. Vercel sets
 * all three to the real client IP, and deliberately *overwrites* any
 * `x-forwarded-for` a client sends rather than forwarding it, so the value is
 * unspoofable there — but `x-vercel-forwarded-for` is the one that survives a
 * proxy stacked on top of Vercel, so it's preferred.
 */
const IP_HEADERS = ["x-vercel-forwarded-for", "x-real-ip", "x-forwarded-for"] as const;

/** Longest possible textual IPv6 address (an IPv4-mapped one, e.g. `::ffff:255.255.255.255`). */
const MAX_IP_LENGTH = 45;

/**
 * Best-effort client IP from proxy headers, for keying anonymous callers.
 *
 * Reads the *last* hop of a forwarded chain, not the first. The first entry is
 * whatever the original caller claimed: the self-hosted deployment (see
 * Dockerfile/docker-compose.yml) sits behind whatever proxy the operator runs,
 * and the stock nginx `$proxy_add_x_forwarded_for` appends the peer address to
 * the client-supplied header — so an attacker sending `X-Forwarded-For: 9.9.9.9`
 * arrives as `9.9.9.9, <their real ip>`. Trusting the first entry there would
 * let anyone mint a fresh rate-limit bucket per request just by varying a
 * header, defeating the throttles on document generation and on guessing
 * fill-request codes. The last entry is the hop the nearest proxy added, which
 * is the only one we can attribute. On Vercel the chain is a single value, so
 * first and last are the same address.
 *
 * Falls back to a single shared `"unknown"` bucket when no address can be read,
 * which over-throttles rather than under-throttles.
 */
export function clientIp(headers: Headers): string {
  for (const header of IP_HEADERS) {
    const lastHop = headers.get(header)?.split(",").at(-1)?.trim();
    // Bounded and charset-checked because this value becomes part of a rate
    // limit key — a unique-indexed text column — so an unvalidated header
    // would let a caller write arbitrary rows into it.
    if (lastHop && lastHop.length <= MAX_IP_LENGTH && /^[0-9a-fA-F.:]+$/.test(lastHop)) {
      return lastHop;
    }
  }
  return "unknown";
}

export async function checkRateLimit(
  key: string,
  { windowMs, max }: { windowMs: number; max: number }
): Promise<{ allowed: boolean; retryAfterSeconds: number }> {
  const db = getDb();
  const now = Date.now();

  const rows = await db
    .insert(rateLimit)
    .values({ id: crypto.randomUUID(), key, count: 1, lastRequest: now })
    .onConflictDoUpdate({
      target: rateLimit.key,
      set: {
        count: sql`CASE WHEN ${now} - ${rateLimit.lastRequest} >= ${windowMs} THEN 1 ELSE ${rateLimit.count} + 1 END`,
        lastRequest: sql`CASE WHEN ${now} - ${rateLimit.lastRequest} >= ${windowMs} THEN ${now}::bigint ELSE ${rateLimit.lastRequest} END`,
      },
      // Only apply the update (and therefore only report "allowed") when the
      // window has rolled over, or the count is still under the cap. When
      // neither holds, this WHERE clause makes the UPDATE (and its
      // RETURNING) a no-op, so `rows` comes back empty below.
      where: sql`(${now} - ${rateLimit.lastRequest} >= ${windowMs}) OR (${rateLimit.count} < ${max})`,
    })
    .returning({ lastRequest: rateLimit.lastRequest });

  if (rows.length > 0) {
    return { allowed: true, retryAfterSeconds: 0 };
  }

  const [existing] = await db.select({ lastRequest: rateLimit.lastRequest }).from(rateLimit).where(eq(rateLimit.key, key));
  const lastRequest = existing?.lastRequest ?? now;
  const retryAfterSeconds = Math.max(1, Math.ceil((lastRequest + windowMs - now) / 1000));
  return { allowed: false, retryAfterSeconds };
}
