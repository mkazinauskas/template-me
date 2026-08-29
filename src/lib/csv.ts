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

/** Normalizes a header/key for fuzzy matching: lowercase, strip non-alphanumerics. */
export function normalizeForMatch(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}
