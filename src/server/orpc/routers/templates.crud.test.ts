// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";
import { call, ORPCError } from "@orpc/server";
import {
  ctx,
  importRouter,
  makeTemplate,
  mockTemplatesRouterDeps,
  resetState,
  state,
} from "./templates.test-helpers";

mockTemplatesRouterDeps();

async function expectORPCError(promise: Promise<unknown>, code: string): Promise<ORPCError<string, unknown>> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof ORPCError) {
      expect(error.code).toBe(code);
      return error;
    }
    throw error;
  }
  throw new Error(`expected the call to reject with an ORPCError(${code})`);
}

describe("templates.list", () => {
  beforeEach(resetState);

  it("rejects with UNAUTHORIZED when there is no session", async () => {
    state.session = null;
    const router = await importRouter();
    await expectORPCError(call(router.list, undefined, ctx()), "UNAUTHORIZED");
  });

  it("returns the caller's templates", async () => {
    state.rows = [makeTemplate({ name: "Offer Letter" })];
    const router = await importRouter();
    const result = await call(router.list, undefined, ctx());
    expect(result.templates).toHaveLength(1);
    expect(result.templates[0].name).toBe("Offer Letter");
  });

  it("returns an empty array when the caller has no templates", async () => {
    const router = await importRouter();
    const result = await call(router.list, undefined, ctx());
    expect(result.templates).toEqual([]);
  });
});

describe("templates.get", () => {
  beforeEach(resetState);

  it("returns the full row (owner + blob fields) to its owner", async () => {
    state.rows = [makeTemplate()];
    const router = await importRouter();
    const { template } = await call(router.get, { id: "t1" }, ctx());
    expect(template).toMatchObject({
      id: "t1",
      userId: "user-1",
      blobUrl: "https://blob/offer.docx",
      blobPathname: "templates/offer.docx",
    });
  });

  it("rejects with NOT_FOUND for a private template with no session", async () => {
    state.session = null;
    state.rows = [makeTemplate()];
    const router = await importRouter();
    const error = await expectORPCError(call(router.get, { id: "t1" }, ctx()), "NOT_FOUND");
    expect(error.message).toBe("Template not found");
  });

  it("rejects with NOT_FOUND when the template does not exist", async () => {
    const router = await importRouter();
    await expectORPCError(call(router.get, { id: "missing" }, ctx()), "NOT_FOUND");
  });

  it("rejects with NOT_FOUND when a private template belongs to another user", async () => {
    state.rows = [makeTemplate({ userId: "someone-else" })];
    const router = await importRouter();
    await expectORPCError(call(router.get, { id: "t1" }, ctx()), "NOT_FOUND");
  });

  it("returns a redacted view of a public template to another signed-in user", async () => {
    state.session = { user: { id: "user-2", email: "other@example.com" } };
    state.rows = [makeTemplate({ userId: "someone-else", isPublic: true })];
    const router = await importRouter();
    const { template } = await call(router.get, { id: "t1" }, ctx());
    expect(template.name).toBe("Offer Letter");
    expect(template).not.toHaveProperty("userId");
    expect(template).not.toHaveProperty("blobUrl");
    expect(template).not.toHaveProperty("blobPathname");
  });

  it("returns a redacted view of a public template to an anonymous caller", async () => {
    state.session = null;
    state.rows = [makeTemplate({ userId: "someone-else", isPublic: true })];
    const router = await importRouter();
    const { template } = await call(router.get, { id: "t1" }, ctx());
    expect(template).not.toHaveProperty("blobUrl");
  });
});

describe("templates.setPublic", () => {
  beforeEach(resetState);

  it("rejects with UNAUTHORIZED when there is no session", async () => {
    state.session = null;
    const router = await importRouter();
    await expectORPCError(call(router.setPublic, { id: "t1", isPublic: true }, ctx()), "UNAUTHORIZED");
  });

  it("rejects with BAD_REQUEST when isPublic is not a boolean", async () => {
    state.rows = [makeTemplate()];
    const router = await importRouter();
    await expectORPCError(
      // @ts-expect-error — deliberately invalid input
      call(router.setPublic, { id: "t1", isPublic: "yes" }, ctx()),
      "BAD_REQUEST"
    );
    expect(state.updatedWith).toBeNull();
  });

  it("rejects with NOT_FOUND when the caller is not the owner", async () => {
    state.rows = [makeTemplate({ userId: "someone-else", isPublic: true })];
    const router = await importRouter();
    await expectORPCError(call(router.setPublic, { id: "t1", isPublic: false }, ctx()), "NOT_FOUND");
    expect(state.updatedWith).toBeNull();
  });

  it("updates isPublic for the owner and returns the row", async () => {
    state.rows = [makeTemplate({ isPublic: false })];
    const router = await importRouter();
    const { template } = await call(router.setPublic, { id: "t1", isPublic: true }, ctx());
    expect(state.updatedWith).toEqual({ isPublic: true });
    expect(template.isPublic).toBe(true);
  });
});

describe("templates.delete", () => {
  beforeEach(resetState);

  it("rejects with UNAUTHORIZED when there is no session", async () => {
    state.session = null;
    const router = await importRouter();
    await expectORPCError(call(router.delete, { id: "t1" }, ctx()), "UNAUTHORIZED");
  });

  it("rejects with NOT_FOUND when the template does not exist", async () => {
    const router = await importRouter();
    await expectORPCError(call(router.delete, { id: "missing" }, ctx()), "NOT_FOUND");
  });

  it("rejects with NOT_FOUND when the template belongs to another user", async () => {
    state.rows = [makeTemplate({ userId: "someone-else", isPublic: true })];
    const router = await importRouter();
    await expectORPCError(call(router.delete, { id: "t1" }, ctx()), "NOT_FOUND");
    expect(state.deletedBlobUrls).toEqual([]);
  });

  it("deletes the blob and the row and returns ok", async () => {
    state.rows = [makeTemplate({ blobUrl: "https://blob/offer.docx" })];
    const router = await importRouter();
    const result = await call(router.delete, { id: "t1" }, ctx());
    expect(result.ok).toBe(true);
    expect(state.deletedBlobUrls).toEqual(["https://blob/offer.docx"]);
    expect(state.deletedIds).toEqual(["t1"]);
  });

  it("still deletes the row when blob deletion fails", async () => {
    state.rows = [makeTemplate()];
    state.deleteBlobThrows = true;
    const router = await importRouter();
    const result = await call(router.delete, { id: "t1" }, ctx());
    expect(result.ok).toBe(true);
    expect(state.deletedIds).toEqual(["t1"]);
  });
});
