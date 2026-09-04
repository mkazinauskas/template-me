// @vitest-environment node
import { vi } from "vitest";
import { NextRequest } from "next/server";
import type { Template } from "@/db/schema";

/** Mutable fixture state the module mocks read from; reset the fields you care about in each beforeEach. */
export const state: {
  rows: Template[];
  insertedRow: Template | null;
  extractFieldsResult: { fields: unknown[]; warnings: string[] };
  extractFieldsError: Error | null;
  putResult: { url: string; pathname: string };
  session: { user: { id: string; email: string } } | null;
  storedFiles: Record<string, Buffer>;
  deletedUrls: string[];
} = {
  rows: [],
  insertedRow: null,
  extractFieldsResult: { fields: [], warnings: [] },
  extractFieldsError: null,
  putResult: { url: "https://blob.example/templates/abc.docx", pathname: "templates/abc.docx" },
  session: { user: { id: "user-1", email: "owner@example.com" } },
  storedFiles: {},
  deletedUrls: [],
};

/**
 * Installs the module mocks the /api/templates route depends on. Uses `vi.doMock`
 * (not the hoisted `vi.mock`) so it can live in this shared helper; every test
 * loads the route via a dynamic `import()` afterwards, so the mocks apply.
 */
export function mockTemplatesRouteDeps() {
  vi.doMock("@/db", () => ({
    getDb: () => ({
      select: () => ({
        from: () => ({ where: () => ({ orderBy: () => Promise.resolve(state.rows) }) }),
      }),
      insert: () => ({
        values: (values: Partial<Template>) => ({
          returning: () => {
            const row = {
              id: "new-id",
              createdAt: new Date("2026-01-01T00:00:00Z"),
              ...values,
            } as Template;
            state.insertedRow = row;
            return Promise.resolve([row]);
          },
        }),
      }),
    }),
  }));

  vi.doMock("@/lib/auth", () => ({
    auth: { api: { getSession: () => Promise.resolve(state.session) } },
  }));

  vi.doMock("@/lib/storage", () => ({
    putFile: vi.fn(async () => state.putResult),
    getFile: vi.fn(async (url: string) => state.storedFiles[url] ?? null),
    deleteFile: vi.fn(async (url: string) => {
      state.deletedUrls.push(url);
    }),
  }));

  vi.doMock("@/lib/docx-template", () => ({
    extractFields: vi.fn(() => {
      if (state.extractFieldsError) throw state.extractFieldsError;
      return state.extractFieldsResult;
    }),
  }));
}

// Real .docx files are zip archives, which always start with this 4-byte
// signature — prefix it by default so these fixtures pass the route's
// magic-byte check the same way a real upload would.
const ZIP_MAGIC = "\x50\x4b\x03\x04";

export function docxFile(name = "template.docx", content: BlobPart = `${ZIP_MAGIC}dummy`) {
  return new File([content], name, {
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
}

export function getRequest() {
  return new NextRequest("http://localhost/api/templates");
}

/** Builds a `POST /api/templates` multipart request. Pass `file: null` to omit the file field. */
export function uploadRequest(fields: { file?: File | null; name?: string } = {}) {
  const formData = new FormData();
  const file = "file" in fields ? fields.file : docxFile();
  if (file) formData.set("file", file);
  if (fields.name !== undefined) formData.set("name", fields.name);
  return new NextRequest("http://localhost/api/templates", { method: "POST", body: formData });
}

/** Builds a `POST /api/templates` JSON finalize request for the client-direct-to-Blob flow. */
export function finalizeRequest(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/templates", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function importHandlers() {
  return import("@/app/api/templates/route");
}
