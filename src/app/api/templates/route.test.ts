// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { Template } from "@/db/schema";

const state = vi.hoisted(() => ({
  rows: [] as Template[],
  insertedRow: null as Template | null,
  extractFieldsResult: { fields: [] as unknown[], warnings: [] as string[] },
  extractFieldsError: null as Error | null,
  putResult: { url: "https://blob.example/templates/abc.docx", pathname: "templates/abc.docx" },
}));

vi.mock("@/db", () => ({
  getDb: () => ({
    select: () => ({
      from: () => ({
        orderBy: () => Promise.resolve(state.rows),
      }),
    }),
    insert: () => ({
      values: (values: Partial<Template>) => ({
        returning: () => {
          const row = { id: "new-id", createdAt: new Date("2026-01-01T00:00:00Z"), ...values } as Template;
          state.insertedRow = row;
          return Promise.resolve([row]);
        },
      }),
    }),
  }),
}));

vi.mock("@vercel/blob", () => ({
  put: vi.fn(async () => state.putResult),
}));

vi.mock("@/lib/docx-template", () => ({
  extractFields: vi.fn(() => {
    if (state.extractFieldsError) throw state.extractFieldsError;
    return state.extractFieldsResult;
  }),
}));

function docxFile(name = "template.docx", content = "dummy") {
  return new File([content], name, {
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
}

describe("GET /api/templates", () => {
  beforeEach(() => {
    state.rows = [];
  });

  it("returns the list of templates from the database", async () => {
    state.rows = [
      {
        id: "t1",
        name: "Offer Letter",
        originalFilename: "offer.docx",
        blobUrl: "https://blob/offer.docx",
        blobPathname: "templates/offer.docx",
        fields: [],
        createdAt: new Date("2026-01-01T00:00:00Z"),
      },
    ];
    const { GET } = await import("@/app/api/templates/route");

    const res = await GET();
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.templates).toHaveLength(1);
    expect(json.templates[0].name).toBe("Offer Letter");
  });

  it("returns an empty array when there are no templates", async () => {
    const { GET } = await import("@/app/api/templates/route");
    const res = await GET();
    const json = await res.json();
    expect(json.templates).toEqual([]);
  });
});

describe("POST /api/templates", () => {
  beforeEach(() => {
    state.insertedRow = null;
    state.extractFieldsError = null;
    state.extractFieldsResult = {
      fields: [{ key: "name", label: "Name", type: "string", params: [] }],
      warnings: [],
    };
  });

  it("rejects a request with no file", async () => {
    const formData = new FormData();
    const req = new NextRequest("http://localhost/api/templates", { method: "POST", body: formData });
    const { POST } = await import("@/app/api/templates/route");

    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBe("Missing file");
  });

  it("rejects a non-.docx file", async () => {
    const formData = new FormData();
    formData.set("file", new File(["x"], "notes.txt", { type: "text/plain" }));
    const req = new NextRequest("http://localhost/api/templates", { method: "POST", body: formData });
    const { POST } = await import("@/app/api/templates/route");

    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBe("File must be a .docx document");
  });

  it("rejects a docx that fails to parse", async () => {
    state.extractFieldsError = new Error("corrupt zip");
    const formData = new FormData();
    formData.set("file", docxFile());
    const req = new NextRequest("http://localhost/api/templates", { method: "POST", body: formData });
    const { POST } = await import("@/app/api/templates/route");

    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBe("Could not read this file as a Word document");
  });

  it("rejects a docx with no templated fields", async () => {
    state.extractFieldsResult = { fields: [], warnings: [] };
    const formData = new FormData();
    formData.set("file", docxFile());
    const req = new NextRequest("http://localhost/api/templates", { method: "POST", body: formData });
    const { POST } = await import("@/app/api/templates/route");

    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toContain("No templated fields found");
  });

  it("stores the uploaded template and returns it with warnings", async () => {
    state.extractFieldsResult = {
      fields: [{ key: "name", label: "Name", type: "string", params: [] }],
      warnings: ['Field "x": type "foo" is unrecognized'],
    };
    const formData = new FormData();
    formData.set("file", docxFile("offer.docx"));
    formData.set("name", "  Offer Letter  ");
    const req = new NextRequest("http://localhost/api/templates", { method: "POST", body: formData });
    const { POST } = await import("@/app/api/templates/route");

    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.template.name).toBe("Offer Letter");
    expect(json.template.originalFilename).toBe("offer.docx");
    expect(json.warnings).toEqual(['Field "x": type "foo" is unrecognized']);
  });

  it("derives the template name from the filename when none is given", async () => {
    const formData = new FormData();
    formData.set("file", docxFile("My Contract.docx"));
    const req = new NextRequest("http://localhost/api/templates", { method: "POST", body: formData });
    const { POST } = await import("@/app/api/templates/route");

    await POST(req);

    expect(state.insertedRow?.name).toBe("My Contract");
  });
});
