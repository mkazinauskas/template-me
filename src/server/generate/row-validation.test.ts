import { describe, expect, it } from "vitest";
import { validateRow } from "@/server/generate/row-validation";
import type { Template, TemplateField } from "@/db/schema";

function templateWith(fields: TemplateField[]): Template {
  return { fields } as Template;
}

describe("validateRow", () => {
  it("accepts a well-formed email value", () => {
    const template = templateWith([{ key: "contact_email", label: "Contact email", type: "email", params: [] }]);
    expect(validateRow(template, { contact_email: "jane@example.com" }, false)).toBeNull();
  });

  it("rejects a malformed email value", () => {
    const template = templateWith([{ key: "contact_email", label: "Contact email", type: "email", params: [] }]);
    expect(validateRow(template, { contact_email: "not-an-email" }, false)).toBe(
      "Invalid value for: contact_email"
    );
  });

  it("accepts a well-formed url value", () => {
    const template = templateWith([{ key: "website", label: "Website", type: "url", params: [] }]);
    expect(validateRow(template, { website: "https://example.com" }, false)).toBeNull();
  });

  it("rejects a malformed url value", () => {
    const template = templateWith([{ key: "website", label: "Website", type: "url", params: [] }]);
    expect(validateRow(template, { website: "not a url" }, false)).toBe("Invalid value for: website");
  });

  it("accepts a numeric currency value", () => {
    const template = templateWith([{ key: "price", label: "Price", type: "currency", params: ["$", "2"] }]);
    expect(validateRow(template, { price: "19.99" }, false)).toBeNull();
  });

  it("rejects a non-numeric currency value", () => {
    const template = templateWith([{ key: "price", label: "Price", type: "currency", params: ["$", "2"] }]);
    expect(validateRow(template, { price: "expensive" }, false)).toBe("Invalid value for: price");
  });

  it("accepts any non-empty text for a textarea value", () => {
    const template = templateWith([{ key: "bio", label: "Bio", type: "textarea", params: [] }]);
    expect(validateRow(template, { bio: "Line one\nLine two" }, false)).toBeNull();
  });

  it("requires textarea, email, url, and currency fields to be present outside of preview mode", () => {
    const template = templateWith([
      { key: "bio", label: "Bio", type: "textarea", params: [] },
      { key: "contact_email", label: "Contact email", type: "email", params: [] },
    ]);
    expect(validateRow(template, { bio: "" }, false)).toBe("Missing values for: bio, contact_email");
  });

  it("skips presence and format checks in preview mode for empty values", () => {
    const template = templateWith([
      { key: "contact_email", label: "Contact email", type: "email", params: [] },
      { key: "website", label: "Website", type: "url", params: [] },
      { key: "price", label: "Price", type: "currency", params: [] },
    ]);
    expect(validateRow(template, {}, true)).toBeNull();
  });
});
