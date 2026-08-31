import { describe, expect, it } from "vitest";
import { buildCsvTemplate, escapeCsvField, normalizeForMatch, parseCsv, rowsToCsv, stripHeaderHint } from "@/lib/csv";
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
    expect(exampleLine).toBe("Sample Full name,1234.50,2026-01-15,Yes,Full-time");
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

  it("uses a 'true' dummy for a checkbox field", () => {
    const csv = buildCsvTemplate([{ key: "agreed", label: "Agreed", type: "checkbox", params: [] }]);
    expect(csv.split("\n")[1]).toBe("true");
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

describe("stripHeaderHint", () => {
  it("extracts the field key from a raw-tag-only header", () => {
    expect(stripHeaderHint("{{full_name}}")).toBe("full_name");
  });

  it("extracts the field key from a tag with type params", () => {
    expect(stripHeaderHint('{{salary|number(2)}}')).toBe("salary");
  });

  it("leaves a header with no tag untouched", () => {
    expect(stripHeaderHint("Full name")).toBe("Full name");
  });

  it("trims surrounding whitespace when there's no tag", () => {
    expect(stripHeaderHint("  Full name  ")).toBe("Full name");
  });

  it("still extracts the key from a legacy 'Label ({{tag}})' header", () => {
    expect(stripHeaderHint("Full name ({{full_name}})")).toBe("full_name");
  });
});

describe("normalizeForMatch", () => {
  it("lowercases and strips non-alphanumeric characters", () => {
    expect(normalizeForMatch("Full Name!")).toBe("fullname");
    expect(normalizeForMatch("full_name")).toBe("fullname");
    expect(normalizeForMatch("Employment-Type")).toBe("employmenttype");
  });
});

describe("parseCsv", () => {
  it("parses a simple CSV into headers and row objects", () => {
    const { headers, rows } = parseCsv("name,age\nAlice,30\nBob,40\n");
    expect(headers).toEqual(["name", "age"]);
    expect(rows).toEqual([
      { name: "Alice", age: "30" },
      { name: "Bob", age: "40" },
    ]);
  });

  it("handles quoted fields with embedded commas", () => {
    const { rows } = parseCsv('name,city\n"Doe, John","New York"\n');
    expect(rows).toEqual([{ name: "Doe, John", city: "New York" }]);
  });

  it("handles escaped double quotes inside quoted fields", () => {
    const { rows } = parseCsv('quote\n"She said ""hi"""\n');
    expect(rows).toEqual([{ quote: 'She said "hi"' }]);
  });

  it("handles CRLF line endings", () => {
    const { headers, rows } = parseCsv("a,b\r\n1,2\r\n3,4\r\n");
    expect(headers).toEqual(["a", "b"]);
    expect(rows).toEqual([{ a: "1", b: "2" }, { a: "3", b: "4" }]);
  });

  it("handles a quoted field containing an embedded newline", () => {
    const { rows } = parseCsv('note,val\n"line1\nline2",x\n');
    expect(rows).toEqual([{ note: "line1\nline2", val: "x" }]);
  });

  it("strips a leading UTF-8 BOM", () => {
    const { headers } = parseCsv("﻿name,age\nAlice,30\n");
    expect(headers).toEqual(["name", "age"]);
  });

  it("trims whitespace from headers and cell values", () => {
    const { headers, rows } = parseCsv(" name , age \n Alice , 30 \n");
    expect(headers).toEqual(["name", "age"]);
    expect(rows).toEqual([{ name: "Alice", age: "30" }]);
  });

  it("fills missing trailing cells with an empty string", () => {
    const { rows } = parseCsv("a,b,c\n1,2\n");
    expect(rows).toEqual([{ a: "1", b: "2", c: "" }]);
  });

  it("returns empty headers/rows for empty input", () => {
    expect(parseCsv("")).toEqual({ headers: [], rows: [] });
    expect(parseCsv("\n")).toEqual({ headers: [], rows: [] });
  });

  it("returns just headers with no rows when only a header line is given", () => {
    const { headers, rows } = parseCsv("a,b\n");
    expect(headers).toEqual(["a", "b"]);
    expect(rows).toEqual([]);
  });

  it("parses the final row even without a trailing newline", () => {
    const { rows } = parseCsv("a\n1\n2");
    expect(rows).toEqual([{ a: "1" }, { a: "2" }]);
  });
});
