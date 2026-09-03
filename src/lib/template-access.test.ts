import { describe, expect, it } from "vitest";
import { canViewTemplate, isTemplateOwner } from "@/lib/template-access";

const priv = { userId: "owner-1", isPublic: false };
const pub = { userId: "owner-1", isPublic: true };

describe("isTemplateOwner", () => {
  it("is true only for the owner with a matching id", () => {
    expect(isTemplateOwner(priv, "owner-1")).toBe(true);
    expect(isTemplateOwner(priv, "someone-else")).toBe(false);
    expect(isTemplateOwner(priv, undefined)).toBe(false);
    expect(isTemplateOwner({ userId: null }, undefined)).toBe(false);
  });
});

describe("canViewTemplate", () => {
  it("lets the owner view their private template", () => {
    expect(canViewTemplate(priv, "owner-1")).toBe(true);
  });

  it("hides a private template from other users and anonymous visitors", () => {
    expect(canViewTemplate(priv, "someone-else")).toBe(false);
    expect(canViewTemplate(priv, undefined)).toBe(false);
  });

  it("lets anyone view a public template", () => {
    expect(canViewTemplate(pub, "owner-1")).toBe(true);
    expect(canViewTemplate(pub, "someone-else")).toBe(true);
    expect(canViewTemplate(pub, undefined)).toBe(true);
  });
});
