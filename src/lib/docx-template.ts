import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import type { TemplateField, TemplateFieldType } from "@/db/schema";

const DELIMITERS = { start: "{{", end: "}}" };
const KNOWN_TYPES: TemplateFieldType[] = ["string", "number", "date", "boolean", "select"];

function toLabel(key: string) {
  return key
    .replace(/[_-]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^./, (c) => c.toUpperCase());
}

/** Splits `a, "b, c", 'd'` into ["a", "b, c", "d"], stripping quotes. */
function parseArgs(argsStr: string): string[] {
  const args: string[] = [];
  let current = "";
  let quoteChar: '"' | "'" | null = null;

  for (const char of argsStr) {
    if (quoteChar) {
      if (char === quoteChar) quoteChar = null;
      else current += char;
    } else if (char === '"' || char === "'") {
      quoteChar = char;
    } else if (char === ",") {
      args.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  const last = current.trim();
  if (last !== "" || args.length > 0) args.push(last);
  return args.filter((a) => a !== "");
}

/**
 * Parses a raw tag body like `birthday|date("yyyy-mm-dd")` into its field
 * key, type, and type arguments. A bare `{{key}}` (no `|type`) defaults to
 * "string". An unrecognized type name falls back to "string" so unknown
 * tags still render as plain text instead of breaking the upload.
 */
function parseTag(raw: string): { key: string; type: TemplateFieldType; params: string[] } {
  const trimmed = raw.trim();
  const pipeIndex = trimmed.indexOf("|");
  if (pipeIndex === -1) {
    return { key: trimmed, type: "string", params: [] };
  }

  const key = trimmed.slice(0, pipeIndex).trim();
  const typeExpr = trimmed.slice(pipeIndex + 1).trim();
  const match = typeExpr.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*(?:\(([^]*)\))?$/);
  if (!match) {
    return { key, type: "string", params: [] };
  }

  const [, typeName, argsStr] = match;
  const normalized = typeName.toLowerCase() as TemplateFieldType;
  const type = KNOWN_TYPES.includes(normalized) ? normalized : "string";
  const params = argsStr ? parseArgs(argsStr) : [];
  return { key, type, params };
}

/** Formats a raw form value according to the field's type before injection. */
function formatFieldValue(field: TemplateField, rawValue: string): string {
  switch (field.type) {
    case "number": {
      const decimals = field.params[0] !== undefined ? parseInt(field.params[0], 10) : undefined;
      const num = Number(rawValue);
      if (Number.isNaN(num)) return rawValue;
      return decimals !== undefined && !Number.isNaN(decimals) ? num.toFixed(decimals) : String(num);
    }
    case "date": {
      const format = field.params[0] || "yyyy-mm-dd";
      return formatDate(rawValue, format);
    }
    case "boolean": {
      const isTrue = rawValue === "true" || rawValue === "on" || rawValue === "1";
      const [trueLabel = "Yes", falseLabel = "No"] = field.params;
      return isTrue ? trueLabel : falseLabel;
    }
    case "select":
    case "string":
    default:
      return rawValue;
  }
}

/** Reformats an ISO `yyyy-mm-dd` (from an <input type="date">) per a format string using yyyy/mm/dd tokens. */
function formatDate(isoDate: string, format: string): string {
  const parsed = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return isoDate;
  const yyyy = String(parsed.getFullYear());
  const mm = String(parsed.getMonth() + 1).padStart(2, "0");
  const dd = String(parsed.getDate()).padStart(2, "0");
  return format.replace(/yyyy/gi, yyyy).replace(/mm/gi, mm).replace(/dd/gi, dd);
}

/** Looks up a tag's value by its key, ignoring the `|type(...)` suffix. */
function scopedParser(tag: string) {
  const key = tag.split("|")[0].trim();
  return {
    get(scope: Record<string, unknown>) {
      return scope[key];
    },
  };
}

function loadDocxtemplater(buffer: Buffer) {
  const zip = new PizZip(buffer);
  return new Docxtemplater(zip, {
    delimiters: DELIMITERS,
    paragraphLoop: true,
    linebreaks: true,
    parser: scopedParser,
  });
}

/**
 * Reads `{{key}}` or `{{key|type(...)}}` placeholders out of a docx
 * template. Uses getFullText(), which docxtemplater reconstructs from the
 * document's XML runs, so tags split across formatting runs are still found
 * intact.
 */
export function extractFields(buffer: Buffer): TemplateField[] {
  const doc = loadDocxtemplater(buffer);
  const fullText = doc.getFullText();
  const matches = fullText.matchAll(/\{\{([^{}]+)\}\}/g);

  const seen = new Map<string, TemplateField>();
  for (const match of matches) {
    const { key, type, params } = parseTag(match[1]);
    if (key && !seen.has(key)) {
      seen.set(key, { key, label: toLabel(key), type, params });
    }
  }
  return Array.from(seen.values());
}

export function renderDocx(
  buffer: Buffer,
  fields: TemplateField[],
  data: Record<string, string>
): Buffer {
  const doc = loadDocxtemplater(buffer);
  const formatted: Record<string, string> = {};
  for (const field of fields) {
    formatted[field.key] = formatFieldValue(field, data[field.key] ?? "");
  }
  doc.render(formatted);
  return doc.getZip().generate({ type: "nodebuffer" });
}
