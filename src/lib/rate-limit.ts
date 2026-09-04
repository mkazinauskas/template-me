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
/** Best-effort client IP from proxy headers, for keying anonymous callers. */
export function clientIp(headers: Headers): string {
  return headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";
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
