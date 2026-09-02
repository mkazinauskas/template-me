// @vitest-environment node
import { vi } from "vitest";
import { NextRequest } from "next/server";
import type { Template, TemplateField } from "@/db/schema";

const FIELDS: TemplateField[] = [
  { key: "full_name", label: "Full name", type: "string", params: [] },
  { key: "salary", label: "Salary", type: "number", params: [] },
  { key: "employment_type", label: "Employment type", type: "select", params: ["Full-time", "Part-time"] },
  { key: "relocation", label: "Relocation", type: "boolean", params: ["Yes", "No"] },
];

/** Mutable fixture state the module mocks below read from; reset it in each suite's beforeEach. */
export const state: {
  templateRow: Template | null;
  storedFile: Buffer | null;
  renderDocxError: Error | null;
  convertSingleError: Error | null;
  convertBulkError: Error | null;
  session: { user: { id: string; email: string } } | null;
  rateLimited: boolean;
} = {
  templateRow: null,
  storedFile: null,
  renderDocxError: null,
  convertSingleError: null,
  convertBulkError: null,
  session: { user: { id: "user-1", email: "owner@example.com" } },
  rateLimited: false,
};

/**
 * Installs the module mocks the generate route depends on. Uses `vi.doMock` (not
 * the hoisted `vi.mock`) so it can live in this shared helper; every test loads
 * the route via a dynamic `import()` after this has run, so the mocks apply.
 * Call once at module scope in each test file.
 */
export function mockGenerateRouteDeps() {
  vi.doMock("@/db", () => ({
    getDb: () => ({
      select: () => ({
        from: () => ({
          where: () =>
            Promise.resolve(
              state.templateRow && state.templateRow.userId === state.session?.user.id
                ? [state.templateRow]
                : []
            ),
        }),
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
    getFile: vi.fn(async () => state.storedFile),
  }));

  vi.doMock("@/lib/docx-template", () => ({
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

/** Resets the fixture state to a valid baseline; call from beforeEach. */
export function resetState() {
  state.templateRow = makeTemplate();
  state.storedFile = Buffer.from("original-docx-bytes");
  state.renderDocxError = null;
  state.convertSingleError = null;
  state.convertBulkError = null;
  state.session = { user: { id: "user-1", email: "owner@example.com" } };
  state.rateLimited = false;
}

export function makeTemplate(overrides: Partial<Template> = {}): Template {
  return {
    id: "t1",
    name: "Offer Letter",
    originalFilename: "offer.docx",
    blobUrl: "https://blob/offer.docx",
    blobPathname: "templates/offer.docx",
    fields: FIELDS,
    userId: "user-1",
    createdAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

export function params(id = "t1") {
  return { params: Promise.resolve({ id }) };
}

export function postRequest(body: unknown) {
  return new NextRequest("http://localhost/api/templates/t1/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export const VALID_DATA = {
  full_name: "Jane Doe",
  salary: "1000",
  employment_type: "Full-time",
  relocation: "true",
};

export async function importPost() {
  const { POST } = await import("@/app/api/templates/[id]/generate/route");
  return POST;
}
