// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import PizZip from "pizzip";
import type { Template, TemplateField } from "@/db/schema";

const FIELDS: TemplateField[] = [
  { key: "full_name", label: "Full name", type: "string", params: [] },
  { key: "salary", label: "Salary", type: "number", params: [] },
  { key: "employment_type", label: "Employment type", type: "select", params: ["Full-time", "Part-time"] },
  { key: "relocation", label: "Relocation", type: "boolean", params: ["Yes", "No"] },
];

const state = vi.hoisted(() => ({
  templateRow: null as Template | null,
  storedFile: null as Buffer | null,
  renderDocxError: null as Error | null,
  convertSingleError: null as Error | null,
  convertBulkError: null as Error | null,
  session: { user: { id: "user-1", email: "owner@example.com" } } as { user: { id: string; email: string } } | null,
  rateLimited: false,
}));

vi.mock("@/db", () => ({
  getDb: () => ({
    select: () => ({
      from: () => ({
        where: () =>
          Promise.resolve(
            state.templateRow && state.templateRow.userId === state.session?.user.id ? [state.templateRow] : []
          ),
      }),
    }),
  }),
}));

vi.mock("@/lib/auth", () => ({
  auth: { api: { getSession: () => Promise.resolve(state.session) } },
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(async () =>
    state.rateLimited ? { allowed: false, retryAfterSeconds: 30 } : { allowed: true, retryAfterSeconds: 0 }
  ),
}));

vi.mock("@/lib/storage", () => ({
  getFile: vi.fn(async () => state.storedFile),
}));

vi.mock("@/lib/docx-template", () => ({
  renderDocx: vi.fn((_buf: Buffer, _fields: TemplateField[], data: Record<string, string>) => {
    if (state.renderDocxError) throw state.renderDocxError;
    return Buffer.from(`docx:${JSON.stringify(data)}`);
  }),
}));

vi.mock("@/lib/docx-to-pdf", () => ({
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

vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return { ...actual, after: (cb: () => void) => cb() };
});

function makeTemplate(overrides: Partial<Template> = {}): Template {
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

function params(id = "t1") {
  return { params: Promise.resolve({ id }) };
}

function postRequest(body: unknown) {
  return new NextRequest("http://localhost/api/templates/t1/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const VALID_DATA = {
  full_name: "Jane Doe",
  salary: "1000",
  employment_type: "Full-time",
  relocation: "true",
};

describe("POST /api/templates/[id]/generate", () => {
  beforeEach(() => {
    state.templateRow = makeTemplate();
    state.storedFile = Buffer.from("original-docx-bytes");
    state.renderDocxError = null;
    state.convertSingleError = null;
    state.convertBulkError = null;
    state.session = { user: { id: "user-1", email: "owner@example.com" } };
    state.rateLimited = false;
  });

  it("returns 429 when the per-user rate limit has been exceeded", async () => {
    state.rateLimited = true;
    const { POST } = await import("@/app/api/templates/[id]/generate/route");

    const res = await POST(postRequest({ data: VALID_DATA }), params());
    const json = await res.json();

    expect(res.status).toBe(429);
    expect(json.error).toContain("Too many document generation requests");
    expect(res.headers.get("Retry-After")).toBe("30");
  });

  it("returns 401 when there is no session", async () => {
    state.session = null;
    const { POST } = await import("@/app/api/templates/[id]/generate/route");

    const res = await POST(postRequest({ data: VALID_DATA }), params());
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json.error).toBe("Unauthorized");
  });

  it("returns 404 when the template does not exist", async () => {
    state.templateRow = null;
    const { POST } = await import("@/app/api/templates/[id]/generate/route");

    const res = await POST(postRequest({ data: VALID_DATA }), params("missing"));
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json.error).toBe("Template not found");
  });

  it("returns 404 when the template belongs to a different user", async () => {
    state.templateRow = makeTemplate({ userId: "someone-else" });
    const { POST } = await import("@/app/api/templates/[id]/generate/route");

    const res = await POST(postRequest({ data: VALID_DATA }), params());
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json.error).toBe("Template not found");
  });

  it("returns 400 for a malformed JSON body", async () => {
    const req = new NextRequest("http://localhost/api/templates/t1/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not json",
    });
    const { POST } = await import("@/app/api/templates/[id]/generate/route");

    const res = await POST(req, params());
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBe("Missing field data");
  });

  it("returns 400 when required field data is missing", async () => {
    const { POST } = await import("@/app/api/templates/[id]/generate/route");

    const res = await POST(postRequest({ data: { full_name: "Jane" } }), params());
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toContain("Missing values for:");
  });

  it("returns 400 for an invalid number value", async () => {
    const { POST } = await import("@/app/api/templates/[id]/generate/route");

    const res = await POST(
      postRequest({ data: { ...VALID_DATA, salary: "not-a-number" } }),
      params()
    );
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBe("Invalid value for: salary");
  });

  it("returns 400 for a select value outside the allowed options", async () => {
    const { POST } = await import("@/app/api/templates/[id]/generate/route");

    const res = await POST(
      postRequest({ data: { ...VALID_DATA, employment_type: "Freelance" } }),
      params()
    );
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBe("Invalid value for: employment_type");
  });

  it("allows a preview request with empty/missing values (skips required-field validation)", async () => {
    const { POST } = await import("@/app/api/templates/[id]/generate/route");

    const res = await POST(postRequest({ data: {}, preview: true }), params());

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Disposition")).toBe("inline");
  });

  it("returns a PDF with an attachment disposition and sanitized filename for a full request", async () => {
    state.templateRow = makeTemplate({ name: "Q4 Offer / Letter!!" });
    const { POST } = await import("@/app/api/templates/[id]/generate/route");

    const res = await POST(postRequest({ data: VALID_DATA }), params());
    const buf = Buffer.from(await res.arrayBuffer());

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
    expect(res.headers.get("Content-Disposition")).toBe('attachment; filename="Q4_Offer_Letter_.pdf"');
    expect(buf.toString()).toContain("Jane Doe");
  });

  it("returns 500 when the template file is missing from blob storage", async () => {
    state.storedFile = null;
    const { POST } = await import("@/app/api/templates/[id]/generate/route");

    const res = await POST(postRequest({ data: VALID_DATA }), params());
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json.error).toBe("Template file is missing from storage");
  });

  it("returns 500 when rendering the docx template fails", async () => {
    state.renderDocxError = new Error("bad template");
    const { POST } = await import("@/app/api/templates/[id]/generate/route");

    const res = await POST(postRequest({ data: VALID_DATA }), params());
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json.error).toBe("Failed to fill in the document");
  });

  it("returns 500 when PDF conversion fails", async () => {
    state.convertSingleError = new Error("libreoffice exploded");
    const { POST } = await import("@/app/api/templates/[id]/generate/route");

    const res = await POST(postRequest({ data: VALID_DATA }), params());
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json.error).toBe("Failed to convert document to PDF");
  });

  it("returns a docx with an attachment disposition and sanitized filename when format is docx", async () => {
    state.templateRow = makeTemplate({ name: "Q4 Offer / Letter!!" });
    // If the docx path accidentally triggers PDF conversion, this forces a failure.
    state.convertSingleError = new Error("should not be called for docx format");
    const { POST } = await import("@/app/api/templates/[id]/generate/route");

    const res = await POST(postRequest({ data: VALID_DATA, format: "docx" }), params());
    const buf = Buffer.from(await res.arrayBuffer());

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe(
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    );
    expect(res.headers.get("Content-Disposition")).toBe('attachment; filename="Q4_Offer_Letter_.docx"');
    expect(buf.toString()).toContain("Jane Doe");
  });

  it("still renders a PDF preview even when format is docx", async () => {
    const { POST } = await import("@/app/api/templates/[id]/generate/route");

    const res = await POST(postRequest({ data: {}, preview: true, format: "docx" }), params());

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
    expect(res.headers.get("Content-Disposition")).toBe("inline");
  });
});

describe("POST /api/templates/[id]/generate (bulk)", () => {
  beforeEach(() => {
    state.templateRow = makeTemplate();
    state.storedFile = Buffer.from("original-docx-bytes");
    state.renderDocxError = null;
    state.convertSingleError = null;
    state.convertBulkError = null;
    state.session = { user: { id: "user-1", email: "owner@example.com" } };
    state.rateLimited = false;
  });

  it("returns 400 when no rows are provided", async () => {
    const { POST } = await import("@/app/api/templates/[id]/generate/route");

    const res = await POST(postRequest({ rows: [] }), params());
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBe("No rows provided");
  });

  it("returns 400 when the row count exceeds the max of 100", async () => {
    const rows = Array.from({ length: 101 }, () => ({ data: VALID_DATA }));
    const { POST } = await import("@/app/api/templates/[id]/generate/route");

    const res = await POST(postRequest({ rows }), params());
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toContain("Too many rows (101)");
  });

  it("returns 400 naming the offending row when a row is missing data", async () => {
    const { POST } = await import("@/app/api/templates/[id]/generate/route");

    const res = await POST(postRequest({ rows: [{ data: VALID_DATA }, {}] }), params());
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBe("Row 2: missing field data");
  });

  it("returns 400 naming the offending row when a row fails validation", async () => {
    const { POST } = await import("@/app/api/templates/[id]/generate/route");

    const res = await POST(
      postRequest({ rows: [{ data: { ...VALID_DATA, salary: "oops" } }] }),
      params()
    );
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBe("Row 1: Invalid value for: salary");
  });

  it("builds a zip with one PDF per row, using custom and default filenames", async () => {
    const { POST } = await import("@/app/api/templates/[id]/generate/route");

    const res = await POST(
      postRequest({
        rows: [
          { data: VALID_DATA, filename: "Custom Name!" },
          { data: { ...VALID_DATA, full_name: "John Roe" } },
        ],
      }),
      params()
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/zip");
    expect(res.headers.get("Content-Disposition")).toBe('attachment; filename="Offer_Letter.zip"');

    const zipBuf = Buffer.from(await res.arrayBuffer());
    const zip = new PizZip(zipBuf);
    const names = Object.keys(zip.files);
    expect(names).toContain("Custom_Name_.pdf");
    expect(names).toContain("Offer Letter-2.pdf".replace(/[^a-zA-Z0-9-_.]+/g, "_"));
  });

  it("disambiguates duplicate filenames with a numeric suffix", async () => {
    const { POST } = await import("@/app/api/templates/[id]/generate/route");

    const res = await POST(
      postRequest({
        rows: [
          { data: VALID_DATA, filename: "same" },
          { data: { ...VALID_DATA, full_name: "John Roe" }, filename: "same" },
        ],
      }),
      params()
    );

    const zipBuf = Buffer.from(await res.arrayBuffer());
    const zip = new PizZip(zipBuf);
    expect(Object.keys(zip.files).sort()).toEqual(["same-2.pdf", "same.pdf"]);
  });

  it("returns 500 when bulk PDF conversion fails", async () => {
    state.convertBulkError = new Error("bulk boom");
    const { POST } = await import("@/app/api/templates/[id]/generate/route");

    const res = await POST(postRequest({ rows: [{ data: VALID_DATA }] }), params());
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json.error).toBe("Failed to convert documents to PDF");
  });

  it("builds a zip with one docx per row when format is docx, skipping PDF conversion", async () => {
    // If the docx path accidentally triggers PDF conversion, this forces a failure.
    state.convertBulkError = new Error("should not be called for docx format");
    const { POST } = await import("@/app/api/templates/[id]/generate/route");

    const res = await POST(
      postRequest({
        rows: [
          { data: VALID_DATA, filename: "Custom Name!" },
          { data: { ...VALID_DATA, full_name: "John Roe" } },
        ],
        format: "docx",
      }),
      params()
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/zip");

    const zipBuf = Buffer.from(await res.arrayBuffer());
    const zip = new PizZip(zipBuf);
    const names = Object.keys(zip.files);
    expect(names).toContain("Custom_Name_.docx");
  });
});
