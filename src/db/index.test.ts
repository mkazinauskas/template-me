// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const neon = vi.fn<(url: string) => string>().mockReturnValue("sql-client");
const drizzle = vi.fn<(client: unknown, config: unknown) => string>().mockReturnValue("db-instance");

vi.mock("@neondatabase/serverless", () => ({ neon: (url: string) => neon(url) }));
vi.mock("drizzle-orm/neon-http", () => ({ drizzle: (client: unknown, config: unknown) => drizzle(client, config) }));

describe("getDb", () => {
  beforeEach(() => {
    vi.resetModules();
    neon.mockClear();
    drizzle.mockClear();
    process.env.DATABASE_URL = "postgres://example/db";
  });

  it("creates the client using DATABASE_URL and returns a drizzle instance", async () => {
    const { getDb } = await import("@/db");

    const db = getDb();

    expect(neon).toHaveBeenCalledWith("postgres://example/db");
    expect(drizzle).toHaveBeenCalledWith("sql-client", expect.objectContaining({ schema: expect.anything() }));
    expect(db).toBe("db-instance");
  });

  it("memoizes the connection across calls instead of recreating it", async () => {
    const { getDb } = await import("@/db");

    getDb();
    getDb();
    getDb();

    expect(neon).toHaveBeenCalledTimes(1);
    expect(drizzle).toHaveBeenCalledTimes(1);
  });
});
