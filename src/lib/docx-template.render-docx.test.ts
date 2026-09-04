import { describe, expect, it } from "vitest";
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import { renderDocx } from "@/lib/docx-template";
import { buildDocx, paragraph, readFixture } from "./docx-template.test-helpers";

describe("renderDocx", () => {
  function renderedText(data: Record<string, string>): string {
    const output = renderDocx(readFixture(), data);
    const doc = new Docxtemplater(new PizZip(output), {
      delimiters: { start: "{{", end: "}}" },
      paragraphLoop: true,
      linebreaks: true,
    });
    return doc.getFullText();
  }

  function renderTagText(bodyXml: string, data: Record<string, string>): string {
    const output = renderDocx(buildDocx(bodyXml), data);
    return new Docxtemplater(new PizZip(output), { delimiters: { start: "{{", end: "}}" } }).getFullText();
  }

  it("substitutes string, number, date, boolean, select, and checkbox values into the document", () => {
    const text = renderedText({
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
    const text = renderedText({
      full_name: "Jane Doe",
      salary: "1000",
      start_date: "2026-01-01",
      relocation: "false",
      employment_type: "Contract",
    });
    expect(text).toContain("No");
  });

  it("renders a checked box for a truthy checkbox value", () => {
    expect(renderTagText(paragraph("{{agreed|checkbox}}"), { agreed: "true" })).toBe("☒");
  });

  it("renders an unchecked box for a falsy or missing checkbox value", () => {
    expect(renderTagText(paragraph("{{agreed|checkbox}}"), {})).toBe("☐");
  });

  it.each(["true", "on", "1", "yes", "y", "YES", "Y"])("treats %j as truthy for a checkbox value", (value) => {
    expect(renderTagText(paragraph("{{agreed|checkbox}}"), { agreed: value })).toBe("☒");
  });

  it("renders an empty string for missing data", () => {
    expect(renderTagText(paragraph("Hello {{name}}!"), {})).toBe("Hello !");
  });

  it("resolves the same key independently per tag when it appears with different formats", () => {
    const body = paragraph("{{start_date|date(&quot;yyyy-mm-dd&quot;)}} / {{start_date|date(&quot;mm-dd-yyyy&quot;)}}");
    expect(renderTagText(body, { start_date: "2026-03-05" })).toBe("2026-03-05 / 03-05-2026");
  });

  it("does not leak curly quotes into the rendered date when Word's autocorrect rewrote the tag's straight quotes", () => {
    const body = paragraph("{{start_date|date(“yyyy-mm-dd”)}}");
    expect(renderTagText(body, { start_date: "2026-03-05" })).toBe("2026-03-05");
  });

  it("rounds fractional twip measurements (Google Docs exports) to integers, leaving the XML declaration alone", () => {
    const body =
      `<w:p><w:pPr><w:ind w:left="708.6614173228347" w:hanging="12.5"/></w:pPr><w:r><w:t>Hi {{name}}</w:t></w:r></w:p>` +
      `<w:sectPr><w:pgMar w:top="850.3937007874016" w:bottom="1134"/></w:sectPr>`;
    const output = renderDocx(buildDocx(body), { name: "Jo" });
    const documentXml = new PizZip(output).file("word/document.xml")!.asText();
    expect(documentXml).toContain('w:top="850"');
    expect(documentXml).toContain('w:left="709"');
    expect(documentXml).toContain('w:hanging="13"');
    expect(documentXml).not.toMatch(/w:[A-Za-z]+="-?\d+\.\d+"/);
    expect(documentXml).toContain('<?xml version="1.0"');
  });

  // Google Docs wraps a multi-page table body in one floating table
  // (`<w:tblpPr>`); LibreOffice pins it to a single anchor point and stacks
  // every row onto page 1. renderDocx must strip that positioning (and the
  // paragraph-level `<w:framePr>`) without dropping rows or touching other tables.
  it("strips floating-table and frame positioning while keeping all rows and non-floated tables", () => {
    const rows = Array.from(
      { length: 40 },
      (_, i) => `<w:tr><w:tc><w:p><w:r><w:t>Clause ${i + 1} for {{name}}</w:t></w:r></w:p></w:tc></w:tr>`
    ).join("");
    const body =
      `<w:tbl><w:tblPr><w:tblpPr w:vertAnchor="text" w:horzAnchor="text" w:tblpX="15" w:tblpY="1"/></w:tblPr>${rows}</w:tbl>` +
      `<w:p><w:pPr><w:framePr w:w="4000" w:vAnchor="text" w:hAnchor="text"/></w:pPr><w:r><w:t>{{name}} sidebar</w:t></w:r></w:p>` +
      `<w:tbl><w:tblPr><w:tblLayout w:type="fixed"/></w:tblPr>` +
      `<w:tr><w:tc><w:p><w:r><w:t>Signature: {{name}}</w:t></w:r></w:p></w:tc></w:tr></w:tbl>`;

    const output = renderDocx(buildDocx(body), { name: "Jo" });
    const documentXml = new PizZip(output).file("word/document.xml")!.asText();

    expect(documentXml).not.toContain("<w:tblpPr");
    expect(documentXml).not.toContain("<w:framePr");
    expect(documentXml.match(/<w:tbl>/g)).toHaveLength(2);
    expect(documentXml.match(/<w:tr>/g)).toHaveLength(41);
    expect(documentXml).toContain("Clause 1 for Jo");
    expect(documentXml).toContain("Clause 40 for Jo");
    expect(documentXml).toContain("Jo sidebar");
    expect(documentXml).toContain('<w:tblLayout w:type="fixed"/>');
  });

  it("leaves a non-numeric number value as-is instead of throwing", () => {
    expect(renderTagText(paragraph("{{amount|number(2)}}"), { amount: "not-a-number" })).toBe("not-a-number");
  });

  it("formats a currency value with its symbol and decimal places", () => {
    expect(renderTagText(paragraph('{{price|currency("$", 2)}}'), { price: "1234.5" })).toBe("$1234.50");
  });

  it("defaults currency to a $ symbol and 2 decimals when no params are given", () => {
    expect(renderTagText(paragraph("{{price|currency}}"), { price: "10" })).toBe("$10.00");
  });

  it("uses a custom currency symbol", () => {
    expect(renderTagText(paragraph('{{price|currency("€", 0)}}'), { price: "10" })).toBe("€10");
  });

  it("leaves a non-numeric currency value as-is instead of throwing", () => {
    expect(renderTagText(paragraph("{{price|currency}}"), { price: "n/a" })).toBe("n/a");
  });

  it("renders an empty string for an empty currency value", () => {
    expect(renderTagText(paragraph("{{price|currency}}"), { price: "" })).toBe("");
  });

  it("passes textarea, email, and url values through unchanged", () => {
    const text = renderTagText(
      paragraph("{{bio|textarea}} / {{contact_email|email}} / {{website|url}}"),
      { bio: "Line one", contact_email: "jane@example.com", website: "https://example.com" }
    );
    expect(text).toBe("Line one / jane@example.com / https://example.com");
  });
});
