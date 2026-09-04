import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import type { TemplateField } from "@/db/schema";
import { parseTag, splitGroup, toLabel } from "./docx-template/tag-parsing";
import { formatFieldValue } from "./docx-template/value-formatting";
import { assertSafeUncompressedSize, sanitizeForLibreOffice } from "./docx-template/zip";

export { isTruthyValue } from "./docx-template/value-formatting";

const DELIMITERS = { start: "{{", end: "}}" };

/**
 * Looks up a tag's raw value by its key and formats it per that specific tag's
 * own `|type(...)` suffix. Parsing the type/params from each tag occurrence
 * (rather than from the deduped `fields` list) lets the same key appear more
 * than once with different formats — e.g. one date shown as `yyyy-mm-dd` and
 * another as `mm-dd-yyyy` — and have each resolve independently.
 */
function scopedParser(tag: string) {
  const { key, type, params } = parseTag(tag);
  return {
    get(scope: Record<string, unknown>) {
      const raw = String(scope[key] ?? "");
      return formatFieldValue({ type, params }, raw);
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

export function renderDocx(buffer: Buffer, data: Record<string, string>): Buffer {
  const doc = loadDocxtemplater(buffer);
  doc.render(data);
  const zip = doc.getZip();
  sanitizeForLibreOffice(zip);
  return zip.generate({ type: "nodebuffer" });
}
