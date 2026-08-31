import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import type { TemplateField, TemplateFieldType } from "@/db/schema";

const DELIMITERS = { start: "{{", end: "}}" };
const KNOWN_TYPES: TemplateFieldType[] = ["string", "number", "date", "boolean", "select", "checkbox"];
const CHECKED_BOX = "☒";
const UNCHECKED_BOX = "☐";

/**
 * Cap on the total *uncompressed* size of a docx's zip entries — guards
 * against a "zip bomb" (a small upload that decompresses into something huge
 * enough to OOM the process) since docxtemplater/PizZip fully decompress
 * entries into memory when reading text or rendering.
 */
const MAX_UNCOMPRESSED_ZIP_BYTES = 50 * 1024 * 1024; // 50 MB

/**
 * Sums each zip entry's uncompressed size straight from the zip's central
 * directory metadata (populated by PizZip while parsing the archive
 * structure) and rejects if the total is implausibly large — without ever
 * decompressing entry contents to measure them, which would itself be the
 * OOM risk this is meant to prevent.
 *
 * `_data.uncompressedSize` isn't part of PizZip's public TypeScript surface,
 * but is populated on every non-directory `ZipObject` as soon as the archive
 * is loaded (see pizzip's zipEntry.js / object.js) — reading it here is safe
 * and doesn't trigger decompression.
 */
function assertSafeUncompressedSize(zip: PizZip) {
  let total = 0;
  for (const relativePath of Object.keys(zip.files)) {
    const entry = zip.files[relativePath];
    if (entry.dir) continue;
    const uncompressedSize =
      (entry as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize ?? 0;
    total += uncompressedSize;
    if (total > MAX_UNCOMPRESSED_ZIP_BYTES) {
      throw new Error("Document contents are too large to process");
    }
  }
}

function toLabel(key: string) {
  return key
    .replace(/[_.-]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^./, (c) => c.toUpperCase());
}

/**
 * Splits a tag key like `person.first_name` into its group ("person") and
 * the remainder used for the field's own label ("first_name"). A key with
 * no dot (or a dot at the very start/end) has no group.
 */
function splitGroup(key: string): { group?: string; localKey: string } {
  const dotIndex = key.indexOf(".");
  if (dotIndex <= 0 || dotIndex === key.length - 1) {
    return { localKey: key };
  }
  return { group: key.slice(0, dotIndex), localKey: key.slice(dotIndex + 1) };
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
 * "string". An unrecognized type name (or unparsable type expression) falls
 * back to "string" so the tag still renders as plain text instead of
 * breaking the upload — `unrecognized` is set in that case so the caller can
 * surface a warning about it.
 */
function parseTag(raw: string): {
  key: string;
  type: TemplateFieldType;
  params: string[];
  unrecognized?: string;
} {
  const trimmed = raw.trim();
  const pipeIndex = trimmed.indexOf("|");
  if (pipeIndex === -1) {
    return { key: trimmed, type: "string", params: [] };
  }

  const key = trimmed.slice(0, pipeIndex).trim();
  const typeExpr = trimmed.slice(pipeIndex + 1).trim();
  const match = typeExpr.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*(?:\(([^]*)\))?$/);
  if (!match) {
    return { key, type: "string", params: [], unrecognized: typeExpr };
  }

  const [, typeName, argsStr] = match;
  const normalized = typeName.toLowerCase() as TemplateFieldType;
  const params = argsStr ? parseArgs(argsStr) : [];
  if (!KNOWN_TYPES.includes(normalized)) {
    return { key, type: "string", params, unrecognized: typeName };
  }
  return { key, type: normalized, params };
}

/** Formats a raw form value according to the field's type before injection. */
function formatFieldValue(field: TemplateField, rawValue: string): string {
  switch (field.type) {
    case "number": {
      if (rawValue.trim() === "") return "";
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
    case "checkbox": {
      const isTrue = rawValue === "true" || rawValue === "on" || rawValue === "1";
      return isTrue ? CHECKED_BOX : UNCHECKED_BOX;
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
  assertSafeUncompressedSize(zip);
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
 * intact. Tags with an unrecognized `|type` are still extracted (as
 * "string") but reported in `warnings` so the caller can tell the user.
 */
export function extractFields(buffer: Buffer): { fields: TemplateField[]; warnings: string[] } {
  const doc = loadDocxtemplater(buffer);
  const fullText = doc.getFullText();
  const matches = fullText.matchAll(/\{\{([^{}]+)\}\}/g);

  const seen = new Map<string, TemplateField>();
  const warnings: string[] = [];
  for (const match of matches) {
    const { key, type, params, unrecognized } = parseTag(match[1]);
    if (key && !seen.has(key)) {
      const { group, localKey } = splitGroup(key);
      seen.set(key, {
        key,
        label: toLabel(localKey),
        type,
        params,
        group,
        groupLabel: group ? toLabel(group) : undefined,
      });
      if (unrecognized) {
        warnings.push(`Field "${key}": type "${unrecognized}" isn't recognized, so it's being treated as plain text.`);
      }
    }
  }
  return { fields: Array.from(seen.values()), warnings };
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
