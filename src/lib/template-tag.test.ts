import { describe, expect, it } from "vitest";
import { formatRawTag } from "@/lib/template-tag";
import type { TemplateField } from "@/db/schema";

function field(overrides: Partial<TemplateField>): TemplateField {
  return { key: "key", label: "Key", type: "string", params: [], ...overrides };
}

describe("formatRawTag", () => {
  it("renders a bare string field with no params as {{key}}", () => {
    expect(formatRawTag(field({ key: "full_name", type: "string", params: [] }))).toBe(
      "{{full_name}}"
    );
  });

  it("renders a string field with params using the |type(...) form", () => {
    expect(
      formatRawTag(field({ key: "greeting", type: "string", params: ["hi"] }))
    ).toBe('{{greeting|string("hi")}}');
  });

  it("renders a typed field with no params as {{key|type}}", () => {
    expect(formatRawTag(field({ key: "salary", type: "number", params: [] }))).toBe(
      "{{salary|number}}"
    );
  });

  it("quotes string-like params (date)", () => {
    expect(
      formatRawTag(field({ key: "start_date", type: "date", params: ["yyyy-mm-dd"] }))
    ).toBe('{{start_date|date("yyyy-mm-dd")}}');
  });

  it("quotes multiple params and joins with a comma", () => {
    expect(
      formatRawTag(field({ key: "relocation", type: "boolean", params: ["Yes", "No"] }))
    ).toBe('{{relocation|boolean("Yes", "No")}}');
  });

  it("does not quote number params", () => {
    expect(formatRawTag(field({ key: "salary", type: "number", params: ["2"] }))).toBe(
      "{{salary|number(2)}}"
    );
  });

  it("quotes select params", () => {
    expect(
      formatRawTag(
        field({ key: "employment_type", type: "select", params: ["Full-time", "Part-time"] })
      )
    ).toBe('{{employment_type|select("Full-time", "Part-time")}}');
  });

  it("renders textarea, email, and url fields with no params as {{key|type}}", () => {
    expect(formatRawTag(field({ key: "bio", type: "textarea", params: [] }))).toBe("{{bio|textarea}}");
    expect(formatRawTag(field({ key: "contact_email", type: "email", params: [] }))).toBe(
      "{{contact_email|email}}"
    );
    expect(formatRawTag(field({ key: "website", type: "url", params: [] }))).toBe("{{website|url}}");
  });

  it("quotes the currency symbol but not the decimal-places param", () => {
    expect(formatRawTag(field({ key: "price", type: "currency", params: ["$", "2"] }))).toBe(
      '{{price|currency("$", 2)}}'
    );
  });
});
