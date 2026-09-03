// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { Template } from "@/db/schema";

const state = vi.hoisted(() => ({
  row: null as Template | null,
  file: null as Buffer | null,
  session: { user: { id: "user-1", email: "owner@example.com" } } as
    | { user: { id: string; email: string } }
    | null,
}));

vi.mock("@/db", () => ({
  getDb: () => ({
    select: () => ({
      from: () => ({
        where: () => Promise.resolve(state.row ? [state.row] : []),
      }),
    }),
  }),
}));

vi.mock("@/lib/auth", () => ({
  auth: { api: { getSession: () => Promise.resolve(state.session) } },
}));

vi.mock("@/lib/storage", () => ({
  getFile: vi.fn(async () => state.file),
}));

function makeTemplate(overrides: Partial<Template> = {}): Template {
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

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

function getRequest(path: string) {
  return new NextRequest(`http://localhost${path}`);
}

describe("GET /api/templates/[id]/download", () => {
  beforeEach(() => {
    state.row = null;
    state.file = Buffer.from("PK raw docx bytes");
    state.session = { user: { id: "user-1", email: "owner@example.com" } };
  });

  it("streams the raw template file to its owner as a .docx attachment", async () => {
    state.row = makeTemplate();
    const { GET } = await import("@/app/api/templates/[id]/download/route");

    const res = await GET(getRequest("/api/templates/t1/download"), params("t1"));

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe(
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    );
    expect(res.headers.get("Content-Disposition")).toBe(
      'attachment; filename="Offer_Letter.docx"'
    );
    expect(Buffer.from(await res.arrayBuffer())).toEqual(state.file);
  });

  it("returns 404 for a private template when there is no session", async () => {
    state.session = null;
    state.row = makeTemplate();
    const { GET } = await import("@/app/api/templates/[id]/download/route");

    const res = await GET(getRequest("/api/templates/t1/download"), params("t1"));

    expect(res.status).toBe(404);
  });

  it("returns 404 when a private template belongs to a different user", async () => {
    state.row = makeTemplate({ userId: "someone-else" });
    const { GET } = await import("@/app/api/templates/[id]/download/route");

    const res = await GET(getRequest("/api/templates/t1/download"), params("t1"));

    expect(res.status).toBe(404);
  });

  it("serves a public template to an anonymous caller", async () => {
    state.session = null;
    state.row = makeTemplate({ userId: "someone-else", isPublic: true });
    const { GET } = await import("@/app/api/templates/[id]/download/route");

    const res = await GET(getRequest("/api/templates/t1/download"), params("t1"));

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Disposition")).toBe(
      'attachment; filename="Offer_Letter.docx"'
    );
  });

  it("returns 404 when the template does not exist", async () => {
    const { GET } = await import("@/app/api/templates/[id]/download/route");

    const res = await GET(
      getRequest("/api/templates/missing/download"),
      params("missing")
    );

    expect(res.status).toBe(404);
  });

  it("returns 500 when the file is missing from storage", async () => {
    state.row = makeTemplate();
    state.file = null;
    const { GET } = await import("@/app/api/templates/[id]/download/route");

    const res = await GET(getRequest("/api/templates/t1/download"), params("t1"));

    expect(res.status).toBe(500);
  });
});
