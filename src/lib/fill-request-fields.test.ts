import { describe, expect, it } from "vitest";
import type { Template, TemplateField } from "@/db/schema";
import { requestedFields, templateForRequest } from "@/lib/fill-request-fields";

const fields: TemplateField[] = [
  { key: "full_name", label: "Full name", type: "string", params: [] },
  { key: "email", label: "Email", type: "email", params: [] },
  { key: "city", label: "City", type: "string", params: [] },
];

const template = { id: "t1", fields } as unknown as Template;

describe("requestedFields", () => {
  it("returns every field when the link asks for everything", () => {
    expect(requestedFields(fields, null)).toBe(fields);
    expect(requestedFields(fields, [])).toBe(fields);
  });

  it("keeps template order regardless of how the keys were listed", () => {
    expect(requestedFields(fields, ["city", "full_name"]).map((f) => f.key)).toEqual([
      "full_name",
      "city",
    ]);
  });

  it("drops keys the template doesn't have", () => {
    expect(requestedFields(fields, ["email", "gone"]).map((f) => f.key)).toEqual(["email"]);
  });
});

describe("templateForRequest", () => {
  it("hands back the template untouched when the link asks for everything", () => {
    expect(templateForRequest(template, null)).toBe(template);
  });

  it("narrows the fields without disturbing the rest of the row", () => {
    const narrowed = templateForRequest(template, ["email"]);
    expect(narrowed.fields.map((f) => f.key)).toEqual(["email"]);
    expect(narrowed.id).toBe("t1");
    // The original is left alone — callers still need the full field list to
    // write a value for every tag.
    expect(template.fields).toHaveLength(3);
  });
});
