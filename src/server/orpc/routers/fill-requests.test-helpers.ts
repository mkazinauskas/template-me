// @vitest-environment node
import { vi } from "vitest";
import { fillRequests, templates, type FillRequest, type Template } from "@/db/schema";

/**
 * Shared fixture state + module mocks for the `fillRequests` oRPC router
 * tests. Each test file calls {@link mockFillRequestsRouterDeps} once at
 * module scope (before importing the router) and resets the fields it cares
 * about in `beforeEach`.
 */
export const state: {
  templateRows: Template[];
  fillRequestRows: FillRequest[];
  joinedRows: Array<{ fillRequest: FillRequest; template: Template }>;
  insertedValues: Partial<FillRequest> | null;
  insertFailTimes: number;
  updateSets: Array<Record<string, unknown>>;
  updateReturns: FillRequest[];
  deletedIds: string[];
  session: { user: { id: string; email: string } } | null;
  rateLimited: boolean;
  nextCode: string;
} = {
  templateRows: [],
  fillRequestRows: [],
  joinedRows: [],
  insertedValues: null,
  insertFailTimes: 0,
  updateSets: [],
  updateReturns: [],
  deletedIds: [],
  session: { user: { id: "user-1", email: "owner@example.com" } },
  rateLimited: false,
  nextCode: "code-1",
};

export function resetState() {
  state.templateRows = [];
  state.fillRequestRows = [];
  state.joinedRows = [];
  state.insertedValues = null;
  state.insertFailTimes = 0;
  state.updateSets = [];
  state.updateReturns = [];
  state.deletedIds = [];
  state.session = { user: { id: "user-1", email: "owner@example.com" } };
  state.rateLimited = false;
  state.nextCode = "code-1";
}

export function mockFillRequestsRouterDeps() {
  vi.doMock("@/db", () => ({
    getDb: () => ({
      select: () => ({
        from: (table: unknown) => {
          if (table === fillRequests) {
            return {
              innerJoin: () => ({
                where: () => Promise.resolve(state.joinedRows),
              }),
              where: () => {
                const p = Promise.resolve(state.fillRequestRows);
                return Object.assign(p, { orderBy: () => Promise.resolve(state.fillRequestRows) });
              },
            };
          }
          if (table === templates) {
            return { where: () => Promise.resolve(state.templateRows) };
          }
          throw new Error("mockFillRequestsRouterDeps: unexpected table in select().from()");
        },
      }),
      insert: () => ({
        values: (values: Partial<FillRequest>) => ({
          returning: () => {
            if (state.insertFailTimes > 0) {
              state.insertFailTimes -= 1;
              const err = new Error("duplicate key value violates unique constraint");
              (err as Error & { code: string }).code = "23505";
              throw err;
            }
            state.insertedValues = values;
            return Promise.resolve([
              {
                id: "fr-new",
                templateId: values.templateId as string,
                code: values.code as string,
                data: null,
                filledAt: null,
                revokedAt: null,
                createdAt: new Date("2026-01-01T00:00:00Z"),
              } satisfies FillRequest,
            ]);
          },
        }),
      }),
      update: () => ({
        set: (values: Record<string, unknown>) => ({
          where: () => ({
            returning: () => {
              state.updateSets.push(values);
              return Promise.resolve(state.updateReturns);
            },
          }),
        }),
      }),
      delete: () => ({
        where: () => {
          state.deletedIds.push(state.joinedRows[0]?.fillRequest.id ?? "");
          return Promise.resolve(undefined);
        },
      }),
    }),
  }));

  vi.doMock("@/lib/auth", () => ({
    auth: { api: { getSession: () => Promise.resolve(state.session) } },
  }));

  vi.doMock("@/lib/rate-limit", () => ({
    checkRateLimit: vi.fn(async () =>
      state.rateLimited
        ? { allowed: false, retryAfterSeconds: 30 }
        : { allowed: true, retryAfterSeconds: 0 }
    ),
    clientIp: () => "127.0.0.1",
  }));

  vi.doMock("nanoid", () => ({
    nanoid: () => state.nextCode,
  }));
}

export function makeTemplate(overrides: Partial<Template> = {}): Template {
  return {
    id: "t1",
    name: "Offer Letter",
    originalFilename: "offer.docx",
    blobUrl: "https://blob/offer.docx",
    blobPathname: "templates/offer.docx",
    fields: [{ key: "full_name", label: "Full name", type: "string", params: [] }],
    userId: "user-1",
    isPublic: false,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

export function makeFillRequest(overrides: Partial<FillRequest> = {}): FillRequest {
  return {
    id: "fr1",
    templateId: "t1",
    code: "abc123",
    data: null,
    filledAt: null,
    revokedAt: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

/** Base context for `call()` — the router's `withSession` middleware reads the session from `@/lib/auth`. */
export function ctx(headers: Record<string, string> = {}) {
  return { context: { headers: new Headers(headers) } };
}

export async function importRouter() {
  const { fillRequestsRouter } = await import("@/server/orpc/routers/fill-requests");
  return fillRequestsRouter;
}
