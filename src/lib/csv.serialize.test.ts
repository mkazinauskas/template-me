import { describe, expect, it } from "vitest";
import { buildCsvTemplate, escapeCsvField, rowsToCsv } from "@/lib/csv";
import type { TemplateField } from "@/db/schema";

describe("buildCsvTemplate", () => {
  it("builds a header row of raw tags only, and a dummy example row", () => {
    const fields: TemplateField[] = [
      { key: "full_name", label: "Full name", type: "string", params: [] },
      { key: "salary", label: "Salary", type: "number", params: ["2"] },
      { key: "start_date", label: "Start date", type: "date", params: [] },
      { key: "relocation", label: "Relocation", type: "boolean", params: ["Yes", "No"] },
      { key: "employment_type", label: "Employment type", type: "select", params: ["Full-time", "Part-time"] },
    ];
    const csv = buildCsvTemplate(fields);
    const [headerLine, exampleLine, trailing] = csv.split("\n");

    expect(headerLine).toBe(
      "{{full_name}},{{salary|number(2)}},{{start_date|date}}," +
        '"{{relocation|boolean(""Yes"", ""No"")}}",' +
        '"{{employment_type|select(""Full-time"", ""Part-time"")}}"'
    );
    expect(exampleLine).toBe("Sample Full name,1234.50,2026-01-15,true,Full-time");
    expect(trailing).toBe("");
  });

  it("uses a plain '1234' number dummy when no decimals are specified", () => {
    const csv = buildCsvTemplate([{ key: "qty", label: "Qty", type: "number", params: [] }]);
    expect(csv.split("\n")[1]).toBe("1234");
  });

  it("defaults the boolean dummy to 'true' when no params are given", () => {
    const csv = buildCsvTemplate([{ key: "active", label: "Active", type: "boolean", params: [] }]);
    expect(csv.split("\n")[1]).toBe("true");
  });

  it("uses the literal 'true' boolean dummy even when a custom true-label is given", () => {
    const csv = buildCsvTemplate([
      { key: "relocation", label: "Relocation", type: "boolean", params: ["Yes", "No"] },
    ]);
    expect(csv.split("\n")[1]).toBe("true");
  });

  it("uses a 'true' dummy for a checkbox field", () => {
    const csv = buildCsvTemplate([{ key: "agreed", label: "Agreed", type: "checkbox", params: [] }]);
    expect(csv.split("\n")[1]).toBe("true");
  });

  it("uses a plain-text dummy for a textarea field", () => {
    const csv = buildCsvTemplate([{ key: "bio", label: "Bio", type: "textarea", params: [] }]);
    expect(csv.split("\n")[1]).toBe("Sample Bio");
  });

  it("uses a sample address for an email field", () => {
    const csv = buildCsvTemplate([{ key: "contact_email", label: "Contact email", type: "email", params: [] }]);
    expect(csv.split("\n")[1]).toBe("sample@example.com");
  });

  it("uses a sample link for a url field", () => {
    const csv = buildCsvTemplate([{ key: "website", label: "Website", type: "url", params: [] }]);
    expect(csv.split("\n")[1]).toBe("https://example.com");
  });

  it("uses a decimal number dummy for a currency field, matching its decimals param", () => {
    const csv = buildCsvTemplate([
      { key: "price", label: "Price", type: "currency", params: ["$", "2"] },
    ]);
    expect(csv.split("\n")[1]).toBe("1234.50");
  });

  it("uses a plain '1234' currency dummy when decimals is 0", () => {
    const csv = buildCsvTemplate([{ key: "price", label: "Price", type: "currency", params: ["$", "0"] }]);
    expect(csv.split("\n")[1]).toBe("1234");
  });

  it("escapes an example row value containing commas or quotes in the label", () => {
    const csv = buildCsvTemplate([
      { key: "note", label: 'Note, "special"', type: "string", params: [] },
    ]);
    const [headerLine, exampleLine] = csv.split("\n");
    expect(headerLine).toBe("{{note}}");
    expect(exampleLine).toBe('"Sample Note, ""special"""');
  });
});

describe("escapeCsvField", () => {
  it("prefixes a leading '=' formula with a single-quote to neutralize it", () => {
    expect(escapeCsvField("=cmd|'/c calc'!A1")).toBe("'=cmd|'/c calc'!A1");
  });

  it("prefixes a leading '+' formula with a single-quote", () => {
    expect(escapeCsvField('+HYPERLINK("http://evil.example","click")')).toBe(
      '\'+HYPERLINK("http://evil.example","click")'
    );
  });

  it("prefixes a leading '-' formula with a single-quote", () => {
    expect(escapeCsvField("-2+3")).toBe("'-2+3");
  });

  it("prefixes a leading '@' formula with a single-quote", () => {
    expect(escapeCsvField("@SUM(A1:A2)")).toBe("'@SUM(A1:A2)");
  });

  it("prefixes a value starting with a tab or carriage return", () => {
    expect(escapeCsvField("\t=1+1")).toBe("'\t=1+1");
    expect(escapeCsvField("\r=1+1")).toBe("'\r=1+1");
  });

  it("still applies RFC 4180 quoting after defanging a formula that also contains a comma", () => {
    expect(escapeCsvField("=1,2")).toBe('"\'=1,2"');
  });

  it("detects a formula trigger after leading whitespace is trimmed", () => {
    expect(escapeCsvField("  =1+1")).toBe("'  =1+1");
  });

  it("leaves an ordinary value untouched", () => {
    expect(escapeCsvField("Jane Doe")).toBe("Jane Doe");
  });
});

describe("rowsToCsv", () => {
  it("serializes headers and rows back into CSV text in the given header order", () => {
    const csv = rowsToCsv(
      ["Full name", "Salary"],
      [
        { "Full name": "Jane Doe", Salary: "1234" },
        { "Full name": "John Roe", Salary: "5678" },
      ]
    );
    expect(csv).toBe("Full name,Salary\nJane Doe,1234\nJohn Roe,5678\n");
  });

  it("escapes header and cell values that contain commas or quotes", () => {
    const csv = rowsToCsv(["Note"], [{ Note: 'has, "quotes"' }]);
    expect(csv).toBe('Note\n"has, ""quotes"""\n');
  });

  it("fills in a blank cell for a row missing one of the headers", () => {
    const csv = rowsToCsv(["A", "B"], [{ A: "1" }]);
    expect(csv).toBe("A,B\n1,\n");
  });
});
