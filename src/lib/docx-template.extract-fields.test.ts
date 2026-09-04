import { describe, expect, it } from "vitest";
import PizZip from "pizzip";
import { extractFields, isTruthyValue } from "@/lib/docx-template";
import { buildDocx, paragraph, readFixture } from "./docx-template.test-helpers";

describe("extractFields", () => {
  it("extracts all field types and their params from a real docx fixture", () => {
    const { fields, warnings } = extractFields(readFixture());
    expect(warnings).toEqual([]);
    expect(fields).toEqual([
      { key: "full_name", label: "Full name", type: "string", params: [] },
      { key: "salary", label: "Salary", type: "number", params: ["2"] },
      { key: "start_date", label: "Start date", type: "date", params: ["dd/mm/yyyy"] },
      { key: "relocation", label: "Relocation", type: "boolean", params: ["Yes", "No"] },
      {
        key: "employment_type",
        label: "Employment type",
        type: "select",
        params: ["Full-time", "Part-time", "Contract"],
      },
      { key: "terms_accepted", label: "Terms accepted", type: "checkbox", params: [] },
    ]);
  });

  it("defaults a bare {{key}} tag to type string with no params", () => {
    const buf = buildDocx(paragraph("Hello {{first_name}}"));
    const { fields } = extractFields(buf);
    expect(fields).toEqual([{ key: "first_name", label: "First name", type: "string", params: [] }]);
  });

  it("dedupes repeated tags, keeping only the first occurrence", () => {
    const buf = buildDocx(paragraph("{{name}} and {{name}} again"));
    const { fields } = extractFields(buf);
    expect(fields).toHaveLength(1);
    expect(fields[0].key).toBe("name");
  });

  it("splits a dotted key into a group and local key", () => {
    const buf = buildDocx(paragraph("{{person.first_name}}"));
    const { fields } = extractFields(buf);
    expect(fields[0]).toEqual({
      key: "person.first_name",
      label: "First name",
      type: "string",
      params: [],
      group: "person",
      groupLabel: "Person",
    });
  });

  it("falls back to string and reports a warning for an unrecognized type", () => {
    const buf = buildDocx(paragraph('{{weird|frobnicate("x")}}'));
    const { fields, warnings } = extractFields(buf);
    expect(fields[0].type).toBe("string");
    expect(warnings).toEqual([
      'Field "weird": type "frobnicate" isn\'t recognized, so it\'s being treated as plain text.',
    ]);
  });

  it("falls back to string and reports a warning for an unparsable type expression", () => {
    const buf = buildDocx(paragraph("{{broken|not valid(}}"));
    const { fields, warnings } = extractFields(buf);
    expect(fields[0].type).toBe("string");
    expect(warnings[0]).toContain('Field "broken"');
  });

  it("returns no fields for a document with no placeholders", () => {
    const buf = buildDocx(paragraph("Just plain text, nothing to see here."));
    const { fields, warnings } = extractFields(buf);
    expect(fields).toEqual([]);
    expect(warnings).toEqual([]);
  });

  it("normalizes an uppercase type name to lowercase", () => {
    const buf = buildDocx(paragraph("{{amount|NUMBER(2)}}"));
    const { fields } = extractFields(buf);
    expect(fields[0].type).toBe("number");
    expect(fields[0].params).toEqual(["2"]);
  });

  it("recognizes the checkbox type with no params", () => {
    const buf = buildDocx(paragraph("{{agreed|checkbox}}"));
    const { fields, warnings } = extractFields(buf);
    expect(fields[0]).toEqual({ key: "agreed", label: "Agreed", type: "checkbox", params: [] });
    expect(warnings).toEqual([]);
  });

  it("recognizes the textarea, email, and url types with no params", () => {
    const buf = buildDocx(
      paragraph("{{bio|textarea}} {{contact_email|email}} {{website|url}}")
    );
    const { fields, warnings } = extractFields(buf);
    expect(fields).toEqual([
      { key: "bio", label: "Bio", type: "textarea", params: [] },
      { key: "contact_email", label: "Contact email", type: "email", params: [] },
      { key: "website", label: "Website", type: "url", params: [] },
    ]);
    expect(warnings).toEqual([]);
  });

  it("strips curly double quotes from params, matching what Word's autocorrect rewrites straight double quotes into", () => {
    const buf = buildDocx(paragraph("{{start_date|date(“yyyy-mm-dd”)}}"));
    const { fields, warnings } = extractFields(buf);
    expect(fields[0]).toEqual({ key: "start_date", label: "Start date", type: "date", params: ["yyyy-mm-dd"] });
    expect(warnings).toEqual([]);
  });

  it("strips curly single quotes from params, matching what Word's autocorrect rewrites straight single quotes into", () => {
    const buf = buildDocx(paragraph("{{start_date|date(‘yyyy-mm-dd’)}}"));
    const { fields } = extractFields(buf);
    expect(fields[0].params).toEqual(["yyyy-mm-dd"]);
  });

  it("splits multiple curly-quoted params on the comma between them, not on commas inside a quoted param", () => {
    const buf = buildDocx(paragraph("{{relocation|boolean(“Yes, sir”, “No”)}}"));
    const { fields } = extractFields(buf);
    expect(fields[0].params).toEqual(["Yes, sir", "No"]);
  });

  it("recognizes the currency type with a symbol and decimal-places param", () => {
    const buf = buildDocx(paragraph('{{price|currency("$", 2)}}'));
    const { fields, warnings } = extractFields(buf);
    expect(fields[0]).toEqual({
      key: "price",
      label: "Price",
      type: "currency",
      params: ["$", "2"],
    });
    expect(warnings).toEqual([]);
  });

  it("finds tags even when split across separate formatting runs", () => {
    const buf = buildDocx(
      "<w:p><w:r><w:t>{{fir</w:t></w:r><w:r><w:t>st_name}}</w:t></w:r></w:p>"
    );
    const { fields } = extractFields(buf);
    expect(fields).toEqual([{ key: "first_name", label: "First name", type: "string", params: [] }]);
  });

  it("rejects a zip whose entries decompress far beyond a reasonable size (zip-bomb guard)", () => {
    const zip = new PizZip();
    // A single highly-compressible 60 MB entry compresses down to a tiny
    // buffer, but would blow past the 50 MB uncompressed cap if read.
    zip.file("word/document.xml", "a".repeat(60 * 1024 * 1024), { compression: "DEFLATE" });
    const buf = zip.generate({ type: "nodebuffer", compression: "DEFLATE" });

    expect(() => extractFields(buf)).toThrow(/too large/i);
  });
});

describe("isTruthyValue", () => {
  it.each(["true", "on", "1", "yes", "y", " TRUE ", "Yes", "Y"])("treats %j as truthy", (value) => {
    expect(isTruthyValue(value)).toBe(true);
  });

  it.each(["false", "off", "0", "no", "n", "", "maybe"])("treats %j as falsy", (value) => {
    expect(isTruthyValue(value)).toBe(false);
  });
});
