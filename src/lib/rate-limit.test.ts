// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  returningRows: [] as { lastRequest: number }[],
  selectRows: [] as { lastRequest: number }[],
  insertedValues: null as unknown,
}));

vi.mock("@/db", () => ({
  getDb: () => ({
    insert: () => ({
      values: (values: unknown) => {
        state.insertedValues = values;
        return {
          onConflictDoUpdate: () => ({
            returning: () => Promise.resolve(state.returningRows),
          }),
        };
      },
    }),
    select: () => ({
      from: () => ({
        where: () => Promise.resolve(state.selectRows),
      }),
    }),
  }),
}));

describe("checkRateLimit", () => {
  beforeEach(() => {
    vi.resetModules();
    state.returningRows = [];
    state.selectRows = [];
    state.insertedValues = null;
  });

  it("allows the request and reports no wait when the upsert returns a row", async () => {
    state.returningRows = [{ lastRequest: Date.now() }];
    const { checkRateLimit } = await import("@/lib/rate-limit");

    const result = await checkRateLimit("generate:user-1", { windowMs: 60_000, max: 10 });

    expect(result).toEqual({ allowed: true, retryAfterSeconds: 0 });
  });

  it("attempts an insert seeded with count 1 for the given key", async () => {
    state.returningRows = [{ lastRequest: Date.now() }];
    const { checkRateLimit } = await import("@/lib/rate-limit");

    await checkRateLimit("generate:user-1", { windowMs: 60_000, max: 10 });

    expect(state.insertedValues).toMatchObject({ key: "generate:user-1", count: 1 });
  });

  it("blocks the request when the upsert's WHERE guard makes it a no-op (limit already reached)", async () => {
    state.returningRows = [];
    const now = Date.now();
    state.selectRows = [{ lastRequest: now - 10_000 }];
    const { checkRateLimit } = await import("@/lib/rate-limit");

    const result = await checkRateLimit("generate:user-1", { windowMs: 60_000, max: 10 });

    expect(result.allowed).toBe(false);
    // ~50s left in a 60s window that started 10s ago.
    expect(result.retryAfterSeconds).toBeGreaterThanOrEqual(49);
    expect(result.retryAfterSeconds).toBeLessThanOrEqual(50);
  });

  it("falls back to a full window's retryAfterSeconds when no existing row is found", async () => {
    state.returningRows = [];
    state.selectRows = [];
    const { checkRateLimit } = await import("@/lib/rate-limit");

    const result = await checkRateLimit("generate:user-1", { windowMs: 60_000, max: 10 });

    expect(result.allowed).toBe(false);
    expect(result.retryAfterSeconds).toBe(60);
  });
});

describe("clientIp", () => {
  async function ip(headers: Record<string, string>) {
    const { clientIp } = await import("@/lib/rate-limit");
    return clientIp(new Headers(headers));
  }

  it("prefers x-vercel-forwarded-for, which survives a proxy stacked on top of Vercel", async () => {
    expect(
      await ip({ "x-vercel-forwarded-for": "203.0.113.7", "x-forwarded-for": "198.51.100.9" })
    ).toBe("203.0.113.7");
  });

  it("falls back through x-real-ip to x-forwarded-for", async () => {
    expect(await ip({ "x-real-ip": "203.0.113.7" })).toBe("203.0.113.7");
    expect(await ip({ "x-forwarded-for": "203.0.113.7" })).toBe("203.0.113.7");
  });

  it("reads the last hop of a chain, so a client-supplied entry can't mint a fresh bucket", async () => {
    // What a stock nginx `$proxy_add_x_forwarded_for` produces when the caller
    // sends their own X-Forwarded-For: the claim first, the real peer last.
    expect(await ip({ "x-forwarded-for": "9.9.9.9, 203.0.113.7" })).toBe("203.0.113.7");
  });

  it("keys spoofed-prefix requests from one address to the same bucket", async () => {
    const first = await ip({ "x-forwarded-for": "1.1.1.1, 203.0.113.7" });
    const second = await ip({ "x-forwarded-for": "2.2.2.2, 203.0.113.7" });
    expect(first).toBe(second);
  });

  it("rejects a header that isn't shaped like an address, rather than keying on it", async () => {
    expect(await ip({ "x-forwarded-for": "not an ip" })).toBe("unknown");
    expect(await ip({ "x-forwarded-for": "1".repeat(200) })).toBe("unknown");
  });

  it("skips an unusable header and keeps looking at the rest", async () => {
    expect(await ip({ "x-real-ip": "bogus!", "x-forwarded-for": "203.0.113.7" })).toBe("203.0.113.7");
  });

  it("shares one bucket when no address can be read", async () => {
    expect(await ip({})).toBe("unknown");
  });
});
