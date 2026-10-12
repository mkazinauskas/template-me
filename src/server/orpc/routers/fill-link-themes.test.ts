// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { call, ORPCError } from "@orpc/server";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { fillLinkThemes, type FillLinkTheme } from "@/db/schema";

const dialect = new PgDialect();

/** What the router asked the database for, with each WHERE compiled to SQL + params. */
const state: {
  session: { user: { id: string; email: string } } | null;
  rows: FillLinkTheme[];
  wheres: Array<{ sql: string; params: unknown[] }>;
  inserted: Record<string, unknown> | null;
  updated: Record<string, unknown> | null;
} = { session: null, rows: [], wheres: [], inserted: null, updated: null };

function recordWhere(where: SQL) {
  state.wheres.push(dialect.sqlToQuery(where));
}

vi.doMock("@/db", () => ({
  getDb: () => ({
    select: () => ({
      from: (table: unknown) => {
        expect(table).toBe(fillLinkThemes);
        return {
          where: (where: SQL) => {
            recordWhere(where);
            return { orderBy: () => Promise.resolve(state.rows) };
          },
        };
      },
    }),
    insert: () => ({
      values: (values: Record<string, unknown>) => {
        state.inserted = values;
        return {
          returning: () => Promise.resolve([theme(values as Partial<FillLinkTheme>)]),
        };
      },
    }),
    update: () => ({
      set: (values: Record<string, unknown>) => ({
        where: (where: SQL) => {
          state.updated = values;
          recordWhere(where);
          return { returning: () => Promise.resolve(state.rows) };
        },
      }),
    }),
    delete: () => ({
      where: (where: SQL) => {
        recordWhere(where);
        return { returning: () => Promise.resolve(state.rows.map((r) => ({ id: r.id }))) };
      },
    }),
  }),
}));

vi.doMock("@/lib/auth", () => ({
  auth: { api: { getSession: () => Promise.resolve(state.session) } },
}));

const THEME_ID = "11111111-1111-4111-8111-111111111111";

const colors = {
  background: "#f4f4f5",
  card: "#ffffff",
  heading: "#112233",
  text: "#3f3f46",
  field: "#ffffff",
  button: "#0055ff",
  buttonText: "#ffffff",
};

function theme(overrides: Partial<FillLinkTheme> = {}): FillLinkTheme {
  return {
    id: THEME_ID,
    userId: "user-1",
    name: "Brand",
    colors,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

const ctx = () => ({ context: { headers: new Headers() } });
const input = { name: "Brand", colors };

async function importRouter() {
  const { fillLinkThemesRouter } = await import("@/server/orpc/routers/fill-link-themes");
  return fillLinkThemesRouter;
}

async function expectCode(promise: Promise<unknown>, code: string) {
  const error = await promise.then(
    () => null,
    (err: unknown) => err
  );
  expect(error).toBeInstanceOf(ORPCError);
  expect((error as ORPCError<string, unknown>).code).toBe(code);
}

/** Every WHERE the router ran was scoped to the caller's user id. */
function expectScopedTo(userId: string) {
  expect(state.wheres.length).toBeGreaterThan(0);
  for (const where of state.wheres) {
    expect(where.sql).toContain('"fill_link_themes"."user_id" = $');
    expect(where.params).toContain(userId);
  }
}

beforeEach(() => {
  state.session = { user: { id: "user-1", email: "owner@example.com" } };
  state.rows = [];
  state.wheres = [];
  state.inserted = null;
  state.updated = null;
});

describe("fillLinkThemes — auth", () => {
  it.each([
    ["list", undefined],
    ["create", input],
    ["update", { id: THEME_ID, ...input }],
    ["delete", { id: THEME_ID }],
  ] as const)("rejects %s with UNAUTHORIZED when signed out", async (name, args) => {
    state.session = null;
    const router = await importRouter();
    await expectCode(call(router[name] as never, args as never, ctx()), "UNAUTHORIZED");
    expect(state.inserted).toBeNull();
    expect(state.updated).toBeNull();
    expect(state.wheres).toEqual([]);
  });
});

describe("fillLinkThemes.list", () => {
  it("returns only the caller's themes", async () => {
    state.rows = [theme()];
    const router = await importRouter();
    const { themes } = await call(router.list, undefined, ctx());
    expect(themes).toEqual([theme()]);
    expectScopedTo("user-1");
  });
});

describe("fillLinkThemes.create", () => {
  it("stores the theme under the caller, name trimmed and colors lowercased", async () => {
    const router = await importRouter();
    await call(
      router.create,
      { name: "  Brand ", colors: { ...colors, button: "#0055FF" } },
      ctx()
    );
    expect(state.inserted).toEqual({ userId: "user-1", ...input });
  });

  it("ignores a userId smuggled into the input", async () => {
    const router = await importRouter();
    await call(router.create, { ...input, userId: "someone-else" } as never, ctx());
    expect(state.inserted).toMatchObject({ userId: "user-1" });
  });

  it.each([
    ["name", { ...input, name: "  " }],
    ["over-long name", { ...input, name: "x".repeat(101) }],
    ["color", { ...input, colors: { ...colors, card: "red" } }],
    ["css injection", { ...input, colors: { ...colors, card: "#fff;}body{x" } }],
    ["missing color", { ...input, colors: { ...colors, heading: undefined } }],
  ])("rejects a blank or invalid %s", async (_label, args) => {
    const router = await importRouter();
    await expectCode(call(router.create, args as never, ctx()), "BAD_REQUEST");
    expect(state.inserted).toBeNull();
  });
});

describe("fillLinkThemes.update", () => {
  it("updates the caller's theme", async () => {
    state.rows = [theme({ name: "Renamed" })];
    const router = await importRouter();
    const { theme: updated } = await call(
      router.update,
      { id: THEME_ID, ...input, name: "Renamed" },
      ctx()
    );
    expect(updated.name).toBe("Renamed");
    expect(state.updated).toEqual({ ...input, name: "Renamed" });
    expectScopedTo("user-1");
    expect(state.wheres[0].params).toContain(THEME_ID);
  });

  it("answers NOT_FOUND for a theme the caller doesn't own", async () => {
    state.rows = [];
    const router = await importRouter();
    await expectCode(call(router.update, { id: THEME_ID, ...input }, ctx()), "NOT_FOUND");
    expectScopedTo("user-1");
  });
});

describe("fillLinkThemes.delete", () => {
  it("deletes the caller's theme", async () => {
    state.rows = [theme()];
    const router = await importRouter();
    const result = await call(router.delete, { id: THEME_ID }, ctx());
    expect(result).toEqual({ id: THEME_ID });
    expectScopedTo("user-1");
  });

  it("answers NOT_FOUND for a theme the caller doesn't own", async () => {
    state.rows = [];
    const router = await importRouter();
    await expectCode(call(router.delete, { id: THEME_ID }, ctx()), "NOT_FOUND");
  });
});
