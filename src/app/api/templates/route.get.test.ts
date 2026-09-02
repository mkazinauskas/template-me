// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";
import {
  getRequest,
  importHandlers,
  mockTemplatesRouteDeps,
  state,
} from "./route.test-helpers";

mockTemplatesRouteDeps();

describe("GET /api/templates", () => {
  beforeEach(() => {
    state.rows = [];
    state.session = { user: { id: "user-1", email: "owner@example.com" } };
  });

  it("returns 401 when there is no session", async () => {
    state.session = null;
    const { GET } = await importHandlers();

    const res = await GET(getRequest());
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json.error).toBe("Unauthorized");
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
        userId: "user-1",
        createdAt: new Date("2026-01-01T00:00:00Z"),
      },
    ];
    const { GET } = await importHandlers();

    const res = await GET(getRequest());
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.templates).toHaveLength(1);
    expect(json.templates[0].name).toBe("Offer Letter");
  });

  it("returns an empty array when there are no templates", async () => {
    const { GET } = await importHandlers();
    const res = await GET(getRequest());
    const json = await res.json();
    expect(json.templates).toEqual([]);
  });
});
