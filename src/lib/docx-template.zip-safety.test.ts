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
