// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const neon = vi.fn<(url: string) => string>().mockReturnValue("sql-client");
const drizzle = vi.fn<(client: unknown, config: unknown) => string>().mockReturnValue("db-instance");
const poolInstance = { marker: "pg-pool", on: vi.fn() };
const Pool = vi.fn<(config: unknown) => object>().mockReturnValue(poolInstance);
const drizzleNodePg = vi.fn<(client: unknown, config: unknown) => string>().mockReturnValue("local-db-instance");

vi.mock("@neondatabase/serverless", () => ({ neon: (url: string) => neon(url) }));
vi.mock("drizzle-orm/neon-http", () => ({ drizzle: (client: unknown, config: unknown) => drizzle(client, config) }));
vi.mock("pg", () => ({
  // A class (rather than a plain arrow function) so `new Pool(...)` in the
  // source under test works; returning an object from the constructor
  // overrides the `this` it would otherwise produce.
  Pool: class {
    constructor(config: unknown) {
      return Pool(config);
    }
  },
}));
vi.mock("drizzle-orm/node-postgres", () => ({
  drizzle: (client: unknown, config: unknown) => drizzleNodePg(client, config),
}));

describe("getDb", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    neon.mockClear();
    drizzle.mockClear();
    Pool.mockClear();
    drizzleNodePg.mockClear();
    process.env = { ...originalEnv, DATABASE_URL: "postgres://example/db" };
    delete process.env.LOCAL_MODE;
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

  it("uses node-postgres against DATABASE_URL when LOCAL_MODE is true", async () => {
    process.env.LOCAL_MODE = "true";
    const { getDb } = await import("@/db");

    const db = getDb();

    expect(Pool).toHaveBeenCalledWith({ connectionString: "postgres://example/db" });
    expect(drizzleNodePg).toHaveBeenCalledWith(poolInstance, expect.objectContaining({ schema: expect.anything() }));
    expect(neon).not.toHaveBeenCalled();
    expect(db).toBe("local-db-instance");
  });
});
