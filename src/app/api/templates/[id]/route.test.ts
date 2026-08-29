// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { Template } from "@/db/schema";

const state = vi.hoisted(() => ({
  row: null as Template | null,
  deletedIds: [] as string[],
  deletedBlobUrls: [] as string[],
  delShouldThrow: false,
}));

vi.mock("@/db", () => ({
  getDb: () => ({
    select: () => ({
      from: () => ({
        where: () => Promise.resolve(state.row ? [state.row] : []),
      }),
    }),
    delete: () => ({
      where: () => {
        state.deletedIds.push(state.row?.id ?? "");
        return Promise.resolve(undefined);
      },
    }),
  }),
}));

vi.mock("@vercel/blob", () => ({
  del: vi.fn(async (url: string) => {
    if (state.delShouldThrow) throw new Error("blob delete failed");
    state.deletedBlobUrls.push(url);
  }),
}));

function makeTemplate(overrides: Partial<Template> = {}): Template {
  return {
    id: "t1",
    name: "Offer Letter",
    originalFilename: "offer.docx",
    blobUrl: "https://blob/offer.docx",
    blobPathname: "templates/offer.docx",
    fields: [],
    createdAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe("GET /api/templates/[id]", () => {
  beforeEach(() => {
    state.row = null;
  });

  it("returns the template when it exists", async () => {
    state.row = makeTemplate();
    const { GET } = await import("@/app/api/templates/[id]/route");

    const res = await GET(new NextRequest("http://localhost/api/templates/t1"), params("t1"));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.template.id).toBe("t1");
  });

  it("returns 404 when the template does not exist", async () => {
    const { GET } = await import("@/app/api/templates/[id]/route");

    const res = await GET(new NextRequest("http://localhost/api/templates/missing"), params("missing"));
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json.error).toBe("Template not found");
  });
});

describe("DELETE /api/templates/[id]", () => {
  beforeEach(() => {
    state.row = null;
    state.deletedIds = [];
    state.deletedBlobUrls = [];
    state.delShouldThrow = false;
  });

  it("returns 404 when the template does not exist", async () => {
    const { DELETE } = await import("@/app/api/templates/[id]/route");

    const res = await DELETE(new NextRequest("http://localhost/api/templates/missing", { method: "DELETE" }), params("missing"));
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json.error).toBe("Template not found");
  });

  it("deletes the blob and the database row, and returns ok", async () => {
    state.row = makeTemplate({ id: "t1", blobUrl: "https://blob/offer.docx" });
    const { DELETE } = await import("@/app/api/templates/[id]/route");

    const res = await DELETE(new NextRequest("http://localhost/api/templates/t1", { method: "DELETE" }), params("t1"));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(state.deletedBlobUrls).toEqual(["https://blob/offer.docx"]);
  });

  it("still deletes the database row even when blob deletion fails", async () => {
    state.row = makeTemplate({ id: "t1" });
    state.delShouldThrow = true;
    const { DELETE } = await import("@/app/api/templates/[id]/route");

    const res = await DELETE(new NextRequest("http://localhost/api/templates/t1", { method: "DELETE" }), params("t1"));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
  });
});
