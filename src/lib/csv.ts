import type { TemplateField } from "@/db/schema";
import { formatRawTag } from "@/lib/template-tag";

// Leading characters that spreadsheet apps (Excel, Google Sheets, etc.)
// treat as the start of a formula when a CSV cell is opened. A field that
// gets echoed back into a CSV (e.g. a submitted bulk-fill value) could
// otherwise be crafted to execute a formula/macro on open — see OWASP's CSV
// injection guidance.
const FORMULA_TRIGGER_CHARS = /^[=+\-@\t\r]/;

/** Escapes a single CSV field per RFC 4180 (quotes when it contains a comma, quote, or newline). */
export function escapeCsvField(value: string): string {
  // Prefix with a literal single-quote so spreadsheet apps treat the cell as
  // plain text instead of a formula. This must happen before (not instead
  // of) the RFC 4180 quoting below, since the prefixed value may still
  // itself contain a comma/quote/newline that needs escaping.
  const defanged = FORMULA_TRIGGER_CHARS.test(value.trim()) ? `'${value}` : value;
  if (/[",\n\r]/.test(defanged)) {
    return `"${defanged.replace(/"/g, '""')}"`;
  }
  return defanged;
}

/** Produces a plausible dummy value for a field, matching its type, so a sample row is easy to understand. */
function dummyValueFor(field: TemplateField): string {
  switch (field.type) {
    case "number": {
      const decimals = Number(field.params[0] ?? 0);
      return decimals > 0 ? (1234.5).toFixed(decimals) : "1234";
    }
    case "date":
      return "2026-01-15";
    case "boolean":
      return field.params[0] || "true";
    case "checkbox":
      return "true";
    case "select":
      return field.params[0] ?? "";
    case "string":
    default:
      return `Sample ${field.label}`;
  }
}

/**
 * Builds a downloadable CSV template with one column per field — headed with
 * its raw `{{...}}` docx tag, so the column headers double as the exact
 * placeholders to fill in — and a sample row of dummy data matching each
 * field's type.
 */
export function buildCsvTemplate(fields: TemplateField[]): string {
  const headerRow = fields.map((f) => escapeCsvField(formatRawTag(f))).join(",");
  const exampleRow = fields.map((f) => escapeCsvField(dummyValueFor(f))).join(",");
  return `${headerRow}\n${exampleRow}\n`;
}

/** Extracts a field key from a header cell containing a `{{key...}}` raw tag, for fuzzy-matching it to a field; leaves a header with no tag untouched. */
export function stripHeaderHint(header: string): string {
  const tagMatch = header.match(/\{\{\s*([^\s|}]+)/);
  return tagMatch ? tagMatch[1] : header.trim();
}

/**
 * Minimal RFC 4180 CSV parser (handles quoted fields, embedded commas,
 * escaped `""` quotes, and CRLF/LF line endings). The first row is treated
 * as the header row.
 */
export function parseCsv(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const source = text.replace(/^﻿/, "");
  const table: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  const pushField = () => {
    row.push(field);
    field = "";
  };
  const pushRow = () => {
    pushField();
    table.push(row);
    row = [];
  };

  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (inQuotes) {
      if (char === '"') {
        if (source[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      pushField();
    } else if (char === "\r") {
      // handled by \n
    } else if (char === "\n") {
      pushRow();
    } else {
      field += char;
    }
  }
  if (field !== "" || row.length > 0) pushRow();

  const nonEmpty = table.filter((r) => !(r.length === 1 && r[0] === ""));
  if (nonEmpty.length === 0) return { headers: [], rows: [] };

  const headers = nonEmpty[0].map((h) => h.trim());
  const rows = nonEmpty.slice(1).map((r) => {
    const obj: Record<string, string> = {};
    headers.forEach((header, i) => {
      obj[header] = (r[i] ?? "").trim();
    });
    return obj;
  });
  return { headers, rows };
}

/**
 * Serializes rows (keyed by header) back into CSV text in the given header
 * order — the inverse of `parseCsv` — so edits made in the page can be
 * downloaded as an updated spreadsheet.
 */
export function rowsToCsv(headers: string[], rows: Record<string, string>[]): string {
  const headerRow = headers.map(escapeCsvField).join(",");
  const dataRows = rows.map((row) => headers.map((h) => escapeCsvField(row[h] ?? "")).join(","));
  return [headerRow, ...dataRows].join("\n") + "\n";
}

/** Normalizes a header/key for fuzzy matching: lowercase, strip non-alphanumerics. */
export function normalizeForMatch(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}
