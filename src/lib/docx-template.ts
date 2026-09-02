import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import type { TemplateField } from "@/db/schema";
import { parseTag, splitGroup, toLabel } from "./docx-template/tag-parsing";
import { formatFieldValue } from "./docx-template/value-formatting";
import { assertSafeUncompressedSize, sanitizeForLibreOffice } from "./docx-template/zip";

export { isTruthyValue } from "./docx-template/value-formatting";

const DELIMITERS = { start: "{{", end: "}}" };

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
 * Reads `{{key}}` or `{{key|type(...)}}` placeholders out of a docx template.
 * Uses getFullText(), which docxtemplater reconstructs from the document's XML
 * runs, so tags split across formatting runs are still found intact. Tags with
 * an unrecognized `|type` are still extracted (as "string") but reported in
 * `warnings` so the caller can tell the user.
 */
export function extractFields(buffer: Buffer): { fields: TemplateField[]; warnings: string[] } {
  const doc = loadDocxtemplater(buffer);
  const matches = doc.getFullText().matchAll(/\{\{([^{}]+)\}\}/g);

  const seen = new Map<string, TemplateField>();
  const warnings: string[] = [];
  for (const match of matches) {
    const { key, type, params, unrecognized } = parseTag(match[1]);
    if (!key || seen.has(key)) continue;

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
      warnings.push(
        `Field "${key}": type "${unrecognized}" isn't recognized, so it's being treated as plain text.`
      );
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
  const zip = doc.getZip();
  sanitizeForLibreOffice(zip);
  return zip.generate({ type: "nodebuffer" });
}
