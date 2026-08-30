import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import { extractFields, renderDocx } from "@/lib/docx-template";
import type { TemplateField } from "@/db/schema";

const FIXTURE_PATH = path.join(process.cwd(), "public", "example-template.docx");

function readFixture(): Buffer {
  return fs.readFileSync(FIXTURE_PATH);
}

/** Builds a minimal .docx buffer from a document.xml body string. */
function buildDocx(bodyXml: string): Buffer {
  const zip = new PizZip();
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`
  );
  zip.file(
    "_rels/.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`
  );
  zip.file(
    "word/_rels/document.xml.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>`
  );
  zip.file(
    "word/document.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>${bodyXml}</w:body>
</w:document>`
  );
  return zip.generate({ type: "nodebuffer" });
}

function paragraph(text: string): string {
  return `<w:p><w:r><w:t>${text}</w:t></w:r></w:p>`;
}

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

  it("finds tags even when split across separate formatting runs", () => {
    const buf = buildDocx(
      "<w:p><w:r><w:t>{{fir</w:t></w:r><w:r><w:t>st_name}}</w:t></w:r></w:p>"
    );
    const { fields } = extractFields(buf);
    expect(fields).toEqual([{ key: "first_name", label: "First name", type: "string", params: [] }]);
  });
});

describe("renderDocx", () => {
  const fields: TemplateField[] = [
    { key: "full_name", label: "Full name", type: "string", params: [] },
    { key: "salary", label: "Salary", type: "number", params: ["2"] },
    { key: "start_date", label: "Start date", type: "date", params: ["dd/mm/yyyy"] },
    { key: "relocation", label: "Relocation", type: "boolean", params: ["Yes", "No"] },
    { key: "employment_type", label: "Employment type", type: "select", params: [] },
    { key: "terms_accepted", label: "Terms accepted", type: "checkbox", params: [] },
  ];

  function renderedText(fixtureFields: TemplateField[], data: Record<string, string>): string {
    const output = renderDocx(readFixture(), fixtureFields, data);
    const zip = new PizZip(output);
    const doc = new Docxtemplater(zip, {
      delimiters: { start: "{{", end: "}}" },
      paragraphLoop: true,
      linebreaks: true,
    });
    return doc.getFullText();
  }

  it("substitutes string, number, date, boolean, select, and checkbox values into the document", () => {
    const text = renderedText(fields, {
      full_name: "Jane Doe",
      salary: "1234.5",
      start_date: "2026-03-05",
      relocation: "true",
      employment_type: "Full-time",
      terms_accepted: "true",
    });
    expect(text).toContain("Jane Doe");
    expect(text).toContain("1234.50");
    expect(text).toContain("05/03/2026");
    expect(text).toContain("Yes");
    expect(text).toContain("Full-time");
    expect(text).toContain("☒");
  });

  it("formats booleans using the field's false label when the value is falsy", () => {
    const text = renderedText(fields, {
      full_name: "Jane Doe",
      salary: "1000",
      start_date: "2026-01-01",
      relocation: "false",
      employment_type: "Contract",
    });
    expect(text).toContain("No");
  });

  it("renders a checked box for a truthy checkbox value", () => {
    const buf = buildDocx(paragraph("{{agreed|checkbox}}"));
    const output = renderDocx(buf, [{ key: "agreed", label: "Agreed", type: "checkbox", params: [] }], {
      agreed: "true",
    });
    const zip = new PizZip(output);
    const doc = new Docxtemplater(zip, { delimiters: { start: "{{", end: "}}" } });
    expect(doc.getFullText()).toBe("☒");
  });

  it("renders an unchecked box for a falsy or missing checkbox value", () => {
    const buf = buildDocx(paragraph("{{agreed|checkbox}}"));
    const output = renderDocx(buf, [{ key: "agreed", label: "Agreed", type: "checkbox", params: [] }], {});
    const zip = new PizZip(output);
    const doc = new Docxtemplater(zip, { delimiters: { start: "{{", end: "}}" } });
    expect(doc.getFullText()).toBe("☐");
  });

  it("renders an empty string for missing data", () => {
    const buf = buildDocx(paragraph("Hello {{name}}!"));
    const output = renderDocx(buf, [{ key: "name", label: "Name", type: "string", params: [] }], {});
    const zip = new PizZip(output);
    const doc = new Docxtemplater(zip, { delimiters: { start: "{{", end: "}}" } });
    expect(doc.getFullText()).toBe("Hello !");
  });

  it("leaves a non-numeric number value as-is instead of throwing", () => {
    const buf = buildDocx(paragraph("{{amount}}"));
    const output = renderDocx(buf, [{ key: "amount", label: "Amount", type: "number", params: ["2"] }], {
      amount: "not-a-number",
    });
    const zip = new PizZip(output);
    const doc = new Docxtemplater(zip, { delimiters: { start: "{{", end: "}}" } });
    expect(doc.getFullText()).toBe("not-a-number");
  });
});
