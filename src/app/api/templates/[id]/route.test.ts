// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { Template } from "@/db/schema";

const state = vi.hoisted(() => ({
  row: null as Template | null,
  deletedIds: [] as string[],
  deletedBlobUrls: [] as string[],
  delShouldThrow: false,
  session: { user: { id: "user-1", email: "owner@example.com" } } as { user: { id: string; email: string } } | null,
}));

vi.mock("@/db", () => ({
  getDb: () => ({
    select: () => ({
      from: () => ({
        where: () => Promise.resolve(state.row && state.row.userId === state.session?.user.id ? [state.row] : []),
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

vi.mock("@/lib/auth", () => ({
  auth: { api: { getSession: () => Promise.resolve(state.session) } },
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
    userId: "user-1",
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

function deleteRequest(path: string) {
  return new NextRequest(`http://localhost${path}`, { method: "DELETE" });
}

describe("GET /api/templates/[id]", () => {
  beforeEach(() => {
    state.row = null;
    state.session = { user: { id: "user-1", email: "owner@example.com" } };
  });

  it("returns 401 when there is no session", async () => {
    state.session = null;
    const { GET } = await import("@/app/api/templates/[id]/route");

    const res = await GET(getRequest("/api/templates/t1"), params("t1"));
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json.error).toBe("Unauthorized");
  });

  it("returns the template when it exists and belongs to the caller", async () => {
    state.row = makeTemplate();
    const { GET } = await import("@/app/api/templates/[id]/route");

    const res = await GET(getRequest("/api/templates/t1"), params("t1"));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.template.id).toBe("t1");
  });

  it("returns 404 when the template does not exist", async () => {
    const { GET } = await import("@/app/api/templates/[id]/route");

    const res = await GET(getRequest("/api/templates/missing"), params("missing"));
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json.error).toBe("Template not found");
  });

  it("returns 404 when the template belongs to a different user", async () => {
    state.row = makeTemplate({ userId: "someone-else" });
    const { GET } = await import("@/app/api/templates/[id]/route");

    const res = await GET(getRequest("/api/templates/t1"), params("t1"));
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
    state.session = { user: { id: "user-1", email: "owner@example.com" } };
  });

  it("returns 401 when there is no session", async () => {
    state.session = null;
    const { DELETE } = await import("@/app/api/templates/[id]/route");

    const res = await DELETE(deleteRequest("/api/templates/t1"), params("t1"));
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json.error).toBe("Unauthorized");
  });

  it("returns 404 when the template does not exist", async () => {
    const { DELETE } = await import("@/app/api/templates/[id]/route");

    const res = await DELETE(deleteRequest("/api/templates/missing"), params("missing"));
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json.error).toBe("Template not found");
  });

  it("returns 404 when the template belongs to a different user", async () => {
    state.row = makeTemplate({ userId: "someone-else" });
    const { DELETE } = await import("@/app/api/templates/[id]/route");

    const res = await DELETE(deleteRequest("/api/templates/t1"), params("t1"));

    expect(res.status).toBe(404);
    expect(state.deletedBlobUrls).toEqual([]);
  });

  it("deletes the blob and the database row, and returns ok", async () => {
    state.row = makeTemplate({ id: "t1", blobUrl: "https://blob/offer.docx" });
    const { DELETE } = await import("@/app/api/templates/[id]/route");

    const res = await DELETE(deleteRequest("/api/templates/t1"), params("t1"));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(state.deletedBlobUrls).toEqual(["https://blob/offer.docx"]);
  });

  it("still deletes the database row even when blob deletion fails", async () => {
    state.row = makeTemplate({ id: "t1" });
    state.delShouldThrow = true;
    const { DELETE } = await import("@/app/api/templates/[id]/route");

    const res = await DELETE(deleteRequest("/api/templates/t1"), params("t1"));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
  });
});
