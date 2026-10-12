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

const ask = { title: "Your details", message: "Fill these in, please." };

const theme = {
  background: "#000000",
  card: "#111111",
  heading: "#ffffff",
  text: "#eeeeee",
  field: "#222222",
  button: "#ff0000",
  buttonText: "#ffffff",
};

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
    await call(router.create, { templateId: "t1", ...ask, fieldKeys: ["city", "full_name"] }, ctx());
    expect(state.insertedValues).toMatchObject({ fieldKeys: ["full_name", "city"] });
  });

  it("stores null — ask for everything — when no selection is given", async () => {
    state.templateRows = [multiFieldTemplate()];
    const router = await importRouter();
    await call(router.create, { templateId: "t1", ...ask }, ctx());
    expect(state.insertedValues).toMatchObject({ fieldKeys: null });
  });

  it("collapses a select-all to null rather than pinning today's field list", async () => {
    state.templateRows = [multiFieldTemplate()];
    const router = await importRouter();
    await call(
      router.create,
      { templateId: "t1", ...ask, fieldKeys: ["full_name", "email", "city"] },
      ctx()
    );
    expect(state.insertedValues).toMatchObject({ fieldKeys: null });
  });

  it("ignores keys the template doesn't have", async () => {
    state.templateRows = [multiFieldTemplate()];
    const router = await importRouter();
    await call(router.create, { templateId: "t1", ...ask, fieldKeys: ["email", "nope"] }, ctx());
    expect(state.insertedValues).toMatchObject({ fieldKeys: ["email"] });
  });

  it("rejects a selection that matches nothing, instead of creating a questionless link", async () => {
    state.templateRows = [multiFieldTemplate()];
    const router = await importRouter();
    await expect(
      call(router.create, { templateId: "t1", ...ask, fieldKeys: ["nope"] }, ctx())
    ).rejects.toBeInstanceOf(ORPCError);
    expect(state.insertedValues).toBeNull();
  });

  it("trims the title and message", async () => {
    state.templateRows = [multiFieldTemplate()];
    const router = await importRouter();
    await call(
      router.create,
      { templateId: "t1", title: "  Onboarding  ", message: "  Hi there " },
      ctx()
    );
    expect(state.insertedValues).toMatchObject({ title: "Onboarding", message: "Hi there" });
  });

  it("rejects a blank title or message", async () => {
    state.templateRows = [multiFieldTemplate()];
    const router = await importRouter();
    await expect(
      call(router.create, { templateId: "t1", title: "Onboarding", message: "   " }, ctx())
    ).rejects.toBeInstanceOf(ORPCError);
    await expect(
      call(router.create, { templateId: "t1", title: "", message: "Hi" }, ctx())
    ).rejects.toBeInstanceOf(ORPCError);
    expect(state.insertedValues).toBeNull();
  });

  it("stores the picked page theme, and null when none is picked", async () => {
    state.templateRows = [multiFieldTemplate()];
    const router = await importRouter();
    await call(router.create, { templateId: "t1", ...ask, theme }, ctx());
    expect(state.insertedValues).toMatchObject({ theme });

    await call(router.create, { templateId: "t1", ...ask }, ctx());
    expect(state.insertedValues).toMatchObject({ theme: null });
  });

  it("rejects a theme color that isn't a hex value", async () => {
    state.templateRows = [multiFieldTemplate()];
    const router = await importRouter();
    await expect(
      call(
        router.create,
        { templateId: "t1", ...ask, theme: { ...theme, background: "url(x)" } },
        ctx()
      )
    ).rejects.toBeInstanceOf(ORPCError);
    expect(state.insertedValues).toBeNull();
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

  it("returns the link's page theme", async () => {
    state.joinedRows = [
      { fillRequest: makeFillRequest({ ...ask, theme }), template: multiFieldTemplate() },
    ];
    const router = await importRouter();
    const result = await call(router.getByCode, { code: "abc123" }, ctx());
    expect(result.theme).toEqual(theme);
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

describe("fillRequests.update — editing an open link", () => {
  beforeEach(resetState);

  it("replaces the ask on a link that hasn't been filled in yet", async () => {
    state.joinedRows = [{ fillRequest: makeFillRequest(ask), template: multiFieldTemplate() }];
    state.updateReturns = [makeFillRequest({ title: "New title" })];
    const router = await importRouter();

    const result = await call(
      router.update,
      { id: "fr1", title: " New title ", message: "New note", fieldKeys: ["city", "email"], theme },
      ctx()
    );

    expect(state.updateSets[0]).toEqual({
      fieldKeys: ["email", "city"],
      title: "New title",
      message: "New note",
      theme,
    });
    expect(result.fillRequest.title).toBe("New title");
  });

  it("clears the theme and field selection when they're left out", async () => {
    state.joinedRows = [
      {
        fillRequest: makeFillRequest({ ...ask, fieldKeys: ["email"], theme }),
        template: multiFieldTemplate(),
      },
    ];
    state.updateReturns = [makeFillRequest()];
    const router = await importRouter();

    await call(router.update, { id: "fr1", ...ask }, ctx());
    expect(state.updateSets[0]).toMatchObject({ fieldKeys: null, theme: null });
  });

  it("refuses a link that's already been filled or revoked", async () => {
    state.joinedRows = [
      { fillRequest: makeFillRequest({ filledAt: new Date() }), template: multiFieldTemplate() },
    ];
    state.updateReturns = [];
    const router = await importRouter();
    await expect(call(router.update, { id: "fr1", ...ask }, ctx())).rejects.toBeInstanceOf(
      ORPCError
    );
  });

  it("refuses someone else's link", async () => {
    state.joinedRows = [
      {
        fillRequest: makeFillRequest(),
        template: makeTemplate({ fields, userId: "someone-else" }),
      },
    ];
    const router = await importRouter();
    await expect(call(router.update, { id: "fr1", ...ask }, ctx())).rejects.toBeInstanceOf(
      ORPCError
    );
    expect(state.updateSets).toHaveLength(0);
  });

  it("rejects a blank title", async () => {
    state.joinedRows = [{ fillRequest: makeFillRequest(), template: multiFieldTemplate() }];
    const router = await importRouter();
    await expect(
      call(router.update, { id: "fr1", title: " ", message: "Hi" }, ctx())
    ).rejects.toBeInstanceOf(ORPCError);
    expect(state.updateSets).toHaveLength(0);
  });
});
