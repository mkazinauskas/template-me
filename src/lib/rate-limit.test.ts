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
