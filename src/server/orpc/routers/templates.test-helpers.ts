// @vitest-environment node
import { vi } from "vitest";
import type { Template, TemplateField } from "@/db/schema";

/**
 * Shared fixture state + module mocks for the `templates` oRPC router tests.
 * Each test file calls {@link mockTemplatesRouterDeps} once at module scope
 * (before importing the router) and resets the fields it cares about in
 * `beforeEach`.
 */
export const state: {
  rows: Template[];
  insertedValues: Partial<Template> | null;
  updatedWith: Partial<Template> | null;
  deletedIds: string[];
  deletedBlobUrls: string[];
  deleteBlobThrows: boolean;
  storedFiles: Record<string, Buffer>;
  putResult: { url: string; pathname: string };
  extractFieldsResult: { fields: TemplateField[]; warnings: string[] };
  extractFieldsError: Error | null;
  renderDocxError: Error | null;
  convertSingleError: Error | null;
  convertBulkError: Error | null;
  session: { user: { id: string; email: string } } | null;
  rateLimited: boolean;
} = {
  rows: [],
  insertedValues: null,
  updatedWith: null,
  deletedIds: [],
  deletedBlobUrls: [],
  deleteBlobThrows: false,
  storedFiles: {},
  putResult: { url: "https://blob.example/templates/new.docx", pathname: "templates/new.docx" },
  extractFieldsResult: { fields: [], warnings: [] },
  extractFieldsError: null,
  renderDocxError: null,
  convertSingleError: null,
  convertBulkError: null,
  session: { user: { id: "user-1", email: "owner@example.com" } },
  rateLimited: false,
};

export function resetState() {
  state.rows = [];
  state.insertedValues = null;
  state.updatedWith = null;
  state.deletedIds = [];
  state.deletedBlobUrls = [];
  state.deleteBlobThrows = false;
  state.storedFiles = {};
  state.putResult = { url: "https://blob.example/templates/new.docx", pathname: "templates/new.docx" };
  state.extractFieldsResult = {
    fields: [{ key: "name", label: "Name", type: "string", params: [] }],
    warnings: [],
  };
  state.extractFieldsError = null;
  state.renderDocxError = null;
  state.convertSingleError = null;
  state.convertBulkError = null;
  state.session = { user: { id: "user-1", email: "owner@example.com" } };
  state.rateLimited = false;
}

export function mockTemplatesRouterDeps() {
  vi.doMock("@/db", () => ({
    getDb: () => ({
      select: () => ({
        from: () => ({
          where: () => {
            const p = Promise.resolve(state.rows);
            return Object.assign(p, { orderBy: () => Promise.resolve(state.rows) });
          },
        }),
      }),
      insert: () => ({
        values: (values: Partial<Template>) => ({
          returning: () => {
            state.insertedValues = values;
            return Promise.resolve([
              { id: "new-id", createdAt: new Date("2026-01-01T00:00:00Z"), ...values } as Template,
            ]);
          },
        }),
      }),
      update: () => ({
        set: (values: Partial<Template>) => ({
          where: () => ({
            returning: () => {
              state.updatedWith = values;
              return Promise.resolve([{ ...(state.rows[0] as Template), ...values }]);
            },
          }),
        }),
      }),
      delete: () => ({
        where: () => {
          state.deletedIds.push(state.rows[0]?.id ?? "");
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
  }));

  vi.doMock("@/lib/storage", () => ({
    putFile: vi.fn(async () => state.putResult),
    getFile: vi.fn(async (url: string) => state.storedFiles[url] ?? null),
    deleteFile: vi.fn(async (url: string) => {
      if (state.deleteBlobThrows) throw new Error("blob delete failed");
      state.deletedBlobUrls.push(url);
    }),
  }));

  vi.doMock("@/lib/docx-template", () => ({
    extractFields: vi.fn(() => {
      if (state.extractFieldsError) throw state.extractFieldsError;
      return state.extractFieldsResult;
    }),
    renderDocx: vi.fn((_buf: Buffer, _fields: TemplateField[], data: Record<string, string>) => {
      if (state.renderDocxError) throw state.renderDocxError;
      return Buffer.from(`docx:${JSON.stringify(data)}`);
    }),
  }));

  vi.doMock("@/lib/docx-to-pdf", () => ({
    createPdfSandbox: vi.fn(async () => ({ stop: vi.fn(async () => {}) })),
    convertDocxToPdf: vi.fn(async (buf: Buffer) => {
      if (state.convertSingleError) throw state.convertSingleError;
      return Buffer.from(`pdf:${buf.toString()}`);
    }),
    convertDocxBuffersToPdf: vi.fn(async (bufs: Buffer[]) => {
      if (state.convertBulkError) throw state.convertBulkError;
      return bufs.map((b) => Buffer.from(`pdf:${b.toString()}`));
    }),
  }));

  vi.doMock("next/server", async (importOriginal) => {
    const actual = await importOriginal<typeof import("next/server")>();
    return { ...actual, after: (cb: () => void) => cb() };
  });
}

// Real .docx files are zip archives, which always start with this 4-byte signature.
export const ZIP_MAGIC = "\x50\x4b\x03\x04";

export function makeTemplate(overrides: Partial<Template> = {}): Template {
  return {
    id: "t1",
    name: "Offer Letter",
    originalFilename: "offer.docx",
    blobUrl: "https://blob/offer.docx",
    blobPathname: "templates/offer.docx",
    fields: [],
    userId: "user-1",
    isPublic: false,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

export const GENERATE_FIELDS: TemplateField[] = [
  { key: "full_name", label: "Full name", type: "string", params: [] },
  { key: "salary", label: "Salary", type: "number", params: [] },
  { key: "employment_type", label: "Employment type", type: "select", params: ["Full-time", "Part-time"] },
  { key: "relocation", label: "Relocation", type: "boolean", params: ["Yes", "No"] },
];

export const VALID_DATA = {
  full_name: "Jane Doe",
  salary: "1000",
  employment_type: "Full-time",
  relocation: "true",
};

/** Base context for `call()` — the router's `withSession` middleware reads the session from `@/lib/auth`. */
export function ctx(headers: Record<string, string> = {}) {
  return { context: { headers: new Headers(headers) } };
}

export async function importRouter() {
  const { templatesRouter } = await import("@/server/orpc/routers/templates");
  return templatesRouter;
}
