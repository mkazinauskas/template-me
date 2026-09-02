// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { Template } from "@/db/schema";

const state = vi.hoisted(() => ({
  row: null as Template | null,
  deletedIds: [] as string[],
  deletedBlobUrls: [] as string[],
  delShouldThrow: false,
  updatedWith: null as Partial<Template> | null,
  session: { user: { id: "user-1", email: "owner@example.com" } } as { user: { id: string; email: string } } | null,
}));

vi.mock("@/db", () => ({
  getDb: () => ({
    // The handlers fetch by id and decide owner-vs-public access in code
    // (see @/lib/template-access), so the mock just returns the fixture row.
    select: () => ({
      from: () => ({
        where: () => Promise.resolve(state.row ? [state.row] : []),
      }),
    }),
    update: () => ({
      set: (values: Partial<Template>) => ({
        where: () => ({
          returning: () => {
            state.updatedWith = values;
            return Promise.resolve([{ ...(state.row as Template), ...values }]);
          },
        }),
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

vi.mock("@/lib/storage", () => ({
  deleteFile: vi.fn(async (url: string) => {
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

function deleteRequest(path: string) {
  return new NextRequest(`http://localhost${path}`, { method: "DELETE" });
}

function patchRequest(path: string, body: unknown) {
  return new NextRequest(`http://localhost${path}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("GET /api/templates/[id]", () => {
  beforeEach(() => {
    state.row = null;
    state.session = { user: { id: "user-1", email: "owner@example.com" } };
  });

  it("returns 404 for a private template when there is no session", async () => {
    state.session = null;
    state.row = makeTemplate();
    const { GET } = await import("@/app/api/templates/[id]/route");

    const res = await GET(getRequest("/api/templates/t1"), params("t1"));
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json.error).toBe("Template not found");
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

  it("returns 404 when a private template belongs to a different user", async () => {
    state.row = makeTemplate({ userId: "someone-else" });
    const { GET } = await import("@/app/api/templates/[id]/route");

    const res = await GET(getRequest("/api/templates/t1"), params("t1"));
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json.error).toBe("Template not found");
  });

  it("returns a public template to a different signed-in user", async () => {
    state.session = { user: { id: "user-2", email: "other@example.com" } };
    state.row = makeTemplate({ userId: "someone-else", isPublic: true });
    const { GET } = await import("@/app/api/templates/[id]/route");

    const res = await GET(getRequest("/api/templates/t1"), params("t1"));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.template.id).toBe("t1");
  });

  it("returns a public template to an anonymous caller", async () => {
    state.session = null;
    state.row = makeTemplate({ userId: "someone-else", isPublic: true });
    const { GET } = await import("@/app/api/templates/[id]/route");

    const res = await GET(getRequest("/api/templates/t1"), params("t1"));

    expect(res.status).toBe(200);
  });
});

describe("PATCH /api/templates/[id]", () => {
  beforeEach(() => {
    state.row = null;
    state.updatedWith = null;
    state.session = { user: { id: "user-1", email: "owner@example.com" } };
  });

  it("returns 401 when there is no session", async () => {
    state.session = null;
    const { PATCH } = await import("@/app/api/templates/[id]/route");

    const res = await PATCH(patchRequest("/api/templates/t1", { isPublic: true }), params("t1"));

    expect(res.status).toBe(401);
  });

  it("returns 400 when isPublic is not a boolean", async () => {
    state.row = makeTemplate();
    const { PATCH } = await import("@/app/api/templates/[id]/route");

    const res = await PATCH(patchRequest("/api/templates/t1", { isPublic: "yes" }), params("t1"));

    expect(res.status).toBe(400);
  });

  it("returns 404 when the caller is not the owner", async () => {
    state.row = makeTemplate({ userId: "someone-else", isPublic: true });
    const { PATCH } = await import("@/app/api/templates/[id]/route");

    const res = await PATCH(patchRequest("/api/templates/t1", { isPublic: false }), params("t1"));

    expect(res.status).toBe(404);
    expect(state.updatedWith).toBeNull();
  });

  it("updates isPublic for the owner and returns the row", async () => {
    state.row = makeTemplate({ isPublic: false });
    const { PATCH } = await import("@/app/api/templates/[id]/route");

    const res = await PATCH(patchRequest("/api/templates/t1", { isPublic: true }), params("t1"));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(state.updatedWith).toEqual({ isPublic: true });
    expect(json.template.isPublic).toBe(true);
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
    state.row = makeTemplate({ userId: "someone-else", isPublic: true });
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
