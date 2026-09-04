// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";
import { call, ORPCError } from "@orpc/server";
import {
  ctx,
  importRouter,
  makeFillRequest,
  makeTemplate,
  mockFillRequestsRouterDeps,
  resetState,
  state,
} from "./fill-requests.test-helpers";

mockFillRequestsRouterDeps();

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

describe("fillRequests.create", () => {
  beforeEach(resetState);

  it("rejects with UNAUTHORIZED when there is no session", async () => {
    state.session = null;
    const router = await importRouter();
    await expectORPCError(call(router.create, { templateId: "t1" }, ctx()), "UNAUTHORIZED");
  });

  it("rejects with NOT_FOUND when the caller doesn't own the template", async () => {
    state.templateRows = [makeTemplate({ userId: "someone-else" })];
    const router = await importRouter();
    await expectORPCError(call(router.create, { templateId: "t1" }, ctx()), "NOT_FOUND");
    expect(state.insertedValues).toBeNull();
  });

  it("creates a fill request with a fresh code for the owner", async () => {
    state.templateRows = [makeTemplate()];
    state.nextCode = "fresh-code";
    const router = await importRouter();
    const { fillRequest } = await call(router.create, { templateId: "t1" }, ctx());
    expect(fillRequest.code).toBe("fresh-code");
    expect(fillRequest.templateId).toBe("t1");
    expect(fillRequest.filledAt).toBeNull();
    expect(state.insertedValues).toMatchObject({ templateId: "t1", code: "fresh-code" });
  });

  it("retries when the generated code collides with an existing one", async () => {
    state.templateRows = [makeTemplate()];
    state.insertFailTimes = 2;
    const router = await importRouter();
    const { fillRequest } = await call(router.create, { templateId: "t1" }, ctx());
    expect(fillRequest.templateId).toBe("t1");
    expect(state.insertedValues).not.toBeNull();
  });
});

describe("fillRequests.list", () => {
  beforeEach(resetState);

  it("rejects with UNAUTHORIZED when there is no session", async () => {
    state.session = null;
    const router = await importRouter();
    await expectORPCError(call(router.list, { templateId: "t1" }, ctx()), "UNAUTHORIZED");
  });

  it("rejects with NOT_FOUND when the caller doesn't own the template", async () => {
    state.templateRows = [makeTemplate({ userId: "someone-else" })];
    const router = await importRouter();
    await expectORPCError(call(router.list, { templateId: "t1" }, ctx()), "NOT_FOUND");
  });

  it("returns the template's fill requests for the owner", async () => {
    state.templateRows = [makeTemplate()];
    state.fillRequestRows = [makeFillRequest({ id: "fr1" }), makeFillRequest({ id: "fr2" })];
    const router = await importRouter();
    const { fillRequests } = await call(router.list, { templateId: "t1" }, ctx());
    expect(fillRequests).toHaveLength(2);
  });
});

describe("fillRequests.revoke", () => {
  beforeEach(resetState);

  it("rejects with UNAUTHORIZED when there is no session", async () => {
    state.session = null;
    const router = await importRouter();
    await expectORPCError(call(router.revoke, { id: "fr1" }, ctx()), "UNAUTHORIZED");
  });

  it("rejects with NOT_FOUND when the link doesn't belong to the caller's template", async () => {
    state.joinedRows = [
      { fillRequest: makeFillRequest(), template: makeTemplate({ userId: "someone-else" }) },
    ];
    const router = await importRouter();
    await expectORPCError(call(router.revoke, { id: "fr1" }, ctx()), "NOT_FOUND");
  });

  it("rejects with NOT_FOUND when the link doesn't exist", async () => {
    state.joinedRows = [];
    const router = await importRouter();
    await expectORPCError(call(router.revoke, { id: "missing" }, ctx()), "NOT_FOUND");
  });

  it("revokes a pending link for the owner", async () => {
    const pending = makeFillRequest();
    state.joinedRows = [{ fillRequest: pending, template: makeTemplate() }];
    state.updateReturns = [{ ...pending, revokedAt: new Date("2026-02-01T00:00:00Z") }];
    const router = await importRouter();
    const { fillRequest } = await call(router.revoke, { id: "fr1" }, ctx());
    expect(fillRequest.revokedAt).not.toBeNull();
  });

  it("is a no-op that returns the existing row when the link was already filled", async () => {
    const filled = makeFillRequest({ filledAt: new Date("2026-01-15T00:00:00Z") });
    state.joinedRows = [{ fillRequest: filled, template: makeTemplate() }];
    state.updateReturns = []; // the conditional UPDATE matches nothing
    const router = await importRouter();
    const { fillRequest } = await call(router.revoke, { id: "fr1" }, ctx());
    expect(fillRequest).toEqual(filled);
  });
});

describe("fillRequests.getByCode", () => {
  beforeEach(resetState);

  it("rejects with TOO_MANY_REQUESTS when the rate limit is exceeded", async () => {
    state.rateLimited = true;
    const router = await importRouter();
    await expectORPCError(call(router.getByCode, { code: "abc123" }, ctx()), "TOO_MANY_REQUESTS");
  });

  it("rejects with NOT_FOUND for an unknown code", async () => {
    state.joinedRows = [];
    const router = await importRouter();
    await expectORPCError(call(router.getByCode, { code: "nope" }, ctx()), "NOT_FOUND");
  });

  it("rejects with NOT_FOUND for an already-filled link", async () => {
    state.joinedRows = [
      {
        fillRequest: makeFillRequest({ filledAt: new Date("2026-01-15T00:00:00Z") }),
        template: makeTemplate(),
      },
    ];
    const router = await importRouter();
    await expectORPCError(call(router.getByCode, { code: "abc123" }, ctx()), "NOT_FOUND");
  });

  it("rejects with NOT_FOUND for a revoked link", async () => {
    state.joinedRows = [
      {
        fillRequest: makeFillRequest({ revokedAt: new Date("2026-01-15T00:00:00Z") }),
        template: makeTemplate(),
      },
    ];
    const router = await importRouter();
    await expectORPCError(call(router.getByCode, { code: "abc123" }, ctx()), "NOT_FOUND");
  });

  it("returns the template's name and fields for an active link, without owner/blob details", async () => {
    state.joinedRows = [{ fillRequest: makeFillRequest(), template: makeTemplate() }];
    const router = await importRouter();
    const result = await call(router.getByCode, { code: "abc123" }, ctx());
    expect(result).toEqual({ templateName: "Offer Letter", fields: makeTemplate().fields });
    expect(result).not.toHaveProperty("userId");
    expect(result).not.toHaveProperty("blobUrl");
  });
});

describe("fillRequests.submit", () => {
  beforeEach(resetState);

  it("rejects with TOO_MANY_REQUESTS when the rate limit is exceeded", async () => {
    state.rateLimited = true;
    const router = await importRouter();
    await expectORPCError(
      call(router.submit, { code: "abc123", data: {} }, ctx()),
      "TOO_MANY_REQUESTS"
    );
  });

  it("rejects with NOT_FOUND for an unknown, already-filled, or revoked code", async () => {
    state.joinedRows = [];
    const router = await importRouter();
    await expectORPCError(
      call(router.submit, { code: "abc123", data: { full_name: "Jane" } }, ctx()),
      "NOT_FOUND"
    );
  });

  it("rejects with BAD_REQUEST when a required field is missing", async () => {
    state.joinedRows = [{ fillRequest: makeFillRequest(), template: makeTemplate() }];
    const router = await importRouter();
    await expectORPCError(call(router.submit, { code: "abc123", data: {} }, ctx()), "BAD_REQUEST");
    expect(state.updateSets).toHaveLength(0);
  });

  it("stores the submitted data, marks the link filled, and rejects a concurrent second submit", async () => {
    state.joinedRows = [{ fillRequest: makeFillRequest(), template: makeTemplate() }];
    state.updateReturns = [
      makeFillRequest({ data: { full_name: "Jane" }, filledAt: new Date("2026-02-01T00:00:00Z") }),
    ];
    const router = await importRouter();
    const result = await call(
      router.submit,
      { code: "abc123", data: { full_name: "Jane" } },
      ctx()
    );
    expect(result).toEqual({ ok: true });
    expect(state.updateSets[0]).toMatchObject({ data: { full_name: "Jane" } });
  });

  it("rejects with NOT_FOUND when the conditional update matches no row (already used concurrently)", async () => {
    state.joinedRows = [{ fillRequest: makeFillRequest(), template: makeTemplate() }];
    state.updateReturns = [];
    const router = await importRouter();
    await expectORPCError(
      call(router.submit, { code: "abc123", data: { full_name: "Jane" } }, ctx()),
      "NOT_FOUND"
    );
  });
});

describe("fillRequests.updateData", () => {
  beforeEach(resetState);

  it("rejects with UNAUTHORIZED when there is no session", async () => {
    state.session = null;
    const router = await importRouter();
    await expectORPCError(
      call(router.updateData, { id: "fr1", data: {} }, ctx()),
      "UNAUTHORIZED"
    );
  });

  it("rejects with NOT_FOUND when the link doesn't belong to the caller's template", async () => {
    state.joinedRows = [
      {
        fillRequest: makeFillRequest({ filledAt: new Date("2026-01-15T00:00:00Z") }),
        template: makeTemplate({ userId: "someone-else" }),
      },
    ];
    const router = await importRouter();
    await expectORPCError(
      call(router.updateData, { id: "fr1", data: { full_name: "Jane" } }, ctx()),
      "NOT_FOUND"
    );
  });

  it("rejects with BAD_REQUEST when the link hasn't been filled in yet", async () => {
    state.joinedRows = [{ fillRequest: makeFillRequest(), template: makeTemplate() }];
    const router = await importRouter();
    await expectORPCError(
      call(router.updateData, { id: "fr1", data: { full_name: "Jane" } }, ctx()),
      "BAD_REQUEST"
    );
    expect(state.updateSets).toHaveLength(0);
  });

  it("rejects with BAD_REQUEST when a required field is missing", async () => {
    state.joinedRows = [
      {
        fillRequest: makeFillRequest({
          data: { full_name: "Jane" },
          filledAt: new Date("2026-01-15T00:00:00Z"),
        }),
        template: makeTemplate(),
      },
    ];
    const router = await importRouter();
    await expectORPCError(
      call(router.updateData, { id: "fr1", data: {} }, ctx()),
      "BAD_REQUEST"
    );
    expect(state.updateSets).toHaveLength(0);
  });

  it("updates the stored data for an already-filled link owned by the caller", async () => {
    const filled = makeFillRequest({
      data: { full_name: "Jane" },
      filledAt: new Date("2026-01-15T00:00:00Z"),
    });
    state.joinedRows = [{ fillRequest: filled, template: makeTemplate() }];
    state.updateReturns = [{ ...filled, data: { full_name: "Jane Doe" } }];
    const router = await importRouter();
    const { fillRequest } = await call(
      router.updateData,
      { id: "fr1", data: { full_name: "Jane Doe" } },
      ctx()
    );
    expect(fillRequest.data).toEqual({ full_name: "Jane Doe" });
    expect(state.updateSets[0]).toMatchObject({ data: { full_name: "Jane Doe" } });
  });
});

describe("fillRequests.delete", () => {
  beforeEach(resetState);

  it("rejects with UNAUTHORIZED when there is no session", async () => {
    state.session = null;
    const router = await importRouter();
    await expectORPCError(call(router.delete, { id: "fr1" }, ctx()), "UNAUTHORIZED");
  });

  it("rejects with NOT_FOUND when the link doesn't belong to the caller's template", async () => {
    state.joinedRows = [
      { fillRequest: makeFillRequest(), template: makeTemplate({ userId: "someone-else" }) },
    ];
    const router = await importRouter();
    await expectORPCError(call(router.delete, { id: "fr1" }, ctx()), "NOT_FOUND");
    expect(state.deletedIds).toEqual([]);
  });

  it("rejects with NOT_FOUND when the link doesn't exist", async () => {
    state.joinedRows = [];
    const router = await importRouter();
    await expectORPCError(call(router.delete, { id: "missing" }, ctx()), "NOT_FOUND");
  });

  it("deletes a filled link owned by the caller", async () => {
    state.joinedRows = [
      {
        fillRequest: makeFillRequest({
          data: { full_name: "Jane" },
          filledAt: new Date("2026-01-15T00:00:00Z"),
        }),
        template: makeTemplate(),
      },
    ];
    const router = await importRouter();
    const result = await call(router.delete, { id: "fr1" }, ctx());
    expect(result).toEqual({ ok: true });
    expect(state.deletedIds).toEqual(["fr1"]);
  });

  it("deletes a pending (unfilled) link owned by the caller", async () => {
    state.joinedRows = [{ fillRequest: makeFillRequest(), template: makeTemplate() }];
    const router = await importRouter();
    const result = await call(router.delete, { id: "fr1" }, ctx());
    expect(result).toEqual({ ok: true });
    expect(state.deletedIds).toEqual(["fr1"]);
  });
});
