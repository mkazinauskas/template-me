import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import type { TemplateField } from "@/db/schema";

const DELIMITERS = { start: "{{", end: "}}" };

function toLabel(key: string) {
  return key
    .replace(/[_-]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^./, (c) => c.toUpperCase());
}

function loadDocxtemplater(buffer: Buffer) {
  const zip = new PizZip(buffer);
  return new Docxtemplater(zip, {
    delimiters: DELIMITERS,
    paragraphLoop: true,
    linebreaks: true,
  });
}

/**
 * Reads {{field_name}} placeholders out of a docx template. Uses
 * getFullText(), which docxtemplater reconstructs from the document's XML
 * runs, so tags split across formatting runs are still found intact.
 */
export function extractFields(buffer: Buffer): TemplateField[] {
  const doc = loadDocxtemplater(buffer);
  const fullText = doc.getFullText();
  const matches = fullText.matchAll(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g);

  const seen = new Map<string, TemplateField>();
  for (const match of matches) {
    const key = match[1];
    if (!seen.has(key)) {
      seen.set(key, { key, label: toLabel(key) });
    }
  }
  return Array.from(seen.values());
}

export function renderDocx(buffer: Buffer, data: Record<string, string>): Buffer {
  const doc = loadDocxtemplater(buffer);
  doc.render(data);
  return doc.getZip().generate({ type: "nodebuffer" });
}
