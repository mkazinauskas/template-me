import { describe, expect, it } from "vitest";
import { canViewTemplate, isTemplateOwner, publicTemplateView } from "@/lib/template-access";

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

describe("publicTemplateView", () => {
  it("strips owner id and blob storage identifiers, keeps everything else", () => {
    const row = {
      id: "t1",
      name: "Offer Letter",
      originalFilename: "offer.docx",
      blobUrl: "https://blob/offer.docx",
      blobPathname: "templates/offer.docx",
      fields: [],
      userId: "owner-1",
      isPublic: true,
    };

    expect(publicTemplateView(row)).toEqual({
      id: "t1",
      name: "Offer Letter",
      originalFilename: "offer.docx",
      fields: [],
      isPublic: true,
    });
  });
});
