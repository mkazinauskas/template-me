// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";
import { call, ORPCError } from "@orpc/server";
import type { TemplateField } from "@/db/schema";
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

const fields: TemplateField[] = [
  { key: "full_name", label: "Full name", type: "string", params: [] },
  { key: "email", label: "Email", type: "email", params: [] },
  { key: "city", label: "City", type: "string", params: [] },
];

function multiFieldTemplate() {
  return makeTemplate({ fields });
}

describe("fillRequests.create — the per-link ask", () => {
  beforeEach(resetState);

  it("stores the picked field keys in template order, not the order they were sent", async () => {
    state.templateRows = [multiFieldTemplate()];
    const router = await importRouter();
    await call(router.create, { templateId: "t1", fieldKeys: ["city", "full_name"] }, ctx());
    expect(state.insertedValues).toMatchObject({ fieldKeys: ["full_name", "city"] });
  });

  it("stores null — ask for everything — when no selection is given", async () => {
    state.templateRows = [multiFieldTemplate()];
    const router = await importRouter();
    await call(router.create, { templateId: "t1" }, ctx());
    expect(state.insertedValues).toMatchObject({ fieldKeys: null, title: null, message: null });
  });

  it("collapses a select-all to null rather than pinning today's field list", async () => {
    state.templateRows = [multiFieldTemplate()];
    const router = await importRouter();
    await call(
      router.create,
      { templateId: "t1", fieldKeys: ["full_name", "email", "city"] },
      ctx()
    );
    expect(state.insertedValues).toMatchObject({ fieldKeys: null });
  });

  it("ignores keys the template doesn't have", async () => {
    state.templateRows = [multiFieldTemplate()];
    const router = await importRouter();
    await call(router.create, { templateId: "t1", fieldKeys: ["email", "nope"] }, ctx());
    expect(state.insertedValues).toMatchObject({ fieldKeys: ["email"] });
  });

  it("rejects a selection that matches nothing, instead of creating a questionless link", async () => {
    state.templateRows = [multiFieldTemplate()];
    const router = await importRouter();
    await expect(
      call(router.create, { templateId: "t1", fieldKeys: ["nope"] }, ctx())
    ).rejects.toBeInstanceOf(ORPCError);
    expect(state.insertedValues).toBeNull();
  });

  it("trims the title and message, storing blank ones as null", async () => {
    state.templateRows = [multiFieldTemplate()];
    const router = await importRouter();
    await call(
      router.create,
      { templateId: "t1", title: "  Onboarding  ", message: "   " },
      ctx()
    );
    expect(state.insertedValues).toMatchObject({ title: "Onboarding", message: null });
  });
});

describe("fillRequests.getByCode — the per-link ask", () => {
  beforeEach(resetState);

  it("returns only the fields the link asks for, plus the owner's note", async () => {
    state.joinedRows = [
      {
        fillRequest: makeFillRequest({
          fieldKeys: ["email"],
          title: "Your contact details",
          message: "Use the address you check daily.",
        }),
        template: multiFieldTemplate(),
      },
    ];
    const router = await importRouter();
    const result = await call(router.getByCode, { code: "abc123" }, ctx());
    expect(result.fields.map((f) => f.key)).toEqual(["email"]);
    expect(result.title).toBe("Your contact details");
    expect(result.message).toBe("Use the address you check daily.");
  });
});

describe("fillRequests.submit — the per-link ask", () => {
  beforeEach(resetState);

  it("accepts a submission that fills only what the link asked for", async () => {
    state.joinedRows = [
      { fillRequest: makeFillRequest({ fieldKeys: ["email"] }), template: multiFieldTemplate() },
    ];
    state.updateReturns = [makeFillRequest({ filledAt: new Date() })];
    const router = await importRouter();

    await call(router.submit, { code: "abc123", data: { email: "ada@example.com" } }, ctx());

    // Fields the link didn't ask for are stored blank, not left missing —
    // the document still needs a value for every tag.
    expect(state.updateSets[0]).toMatchObject({
      data: { full_name: "", email: "ada@example.com", city: "" },
    });
  });

  it("still rejects an invalid value for a field the link did ask for", async () => {
    state.joinedRows = [
      { fillRequest: makeFillRequest({ fieldKeys: ["email"] }), template: multiFieldTemplate() },
    ];
    const router = await importRouter();
    await expect(
      call(router.submit, { code: "abc123", data: { email: "not-an-email" } }, ctx())
    ).rejects.toBeInstanceOf(ORPCError);
    expect(state.updateSets).toHaveLength(0);
  });

  it("still requires every field when the link asks for everything", async () => {
    state.joinedRows = [
      { fillRequest: makeFillRequest({ fieldKeys: null }), template: multiFieldTemplate() },
    ];
    const router = await importRouter();
    await expect(
      call(router.submit, { code: "abc123", data: { email: "ada@example.com" } }, ctx())
    ).rejects.toBeInstanceOf(ORPCError);
  });
});
