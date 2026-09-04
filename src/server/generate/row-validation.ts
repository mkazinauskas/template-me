import type { Template } from "@/db/schema";
import { renderDocx } from "@/lib/docx-template";

export const MAX_BULK_ROWS = 100;

/**
 * Validates one row's data against the template's fields. Returns an error
 * message, or null if valid. Previews skip the "required field is present"
 * check so a half-filled form can still render.
 */
export function validateRow(
  templateRow: Template,
  data: Record<string, unknown>,
  preview: boolean
): string | null {
  if (!preview) {
    const missing = templateRow.fields
      .filter((f) => f.type !== "boolean" && f.type !== "checkbox")
      .map((f) => f.key)
      .filter((key) => !(key in data) || String(data[key]).trim() === "");
    if (missing.length > 0) {
      return `Missing values for: ${missing.join(", ")}`;
    }
  }

  const invalid: string[] = [];
  for (const field of templateRow.fields) {
    const value = String(data[field.key] ?? "");
    if (preview && value === "") continue;
    if (field.type === "number" && value !== "" && Number.isNaN(Number(value))) {
      invalid.push(field.key);
    }
    if (field.type === "select" && field.params.length > 0 && !field.params.includes(value)) {
      invalid.push(field.key);
    }
  }
  if (invalid.length > 0) {
    return `Invalid value for: ${invalid.join(", ")}`;
  }
  return null;
}

/** Fills the template's docx with one row's data, coercing every field value to a string first. */
export function renderRow(
  templateRow: Template,
  originalDocx: Buffer,
  data: Record<string, unknown>
): Buffer {
  const stringData: Record<string, string> = {};
  for (const field of templateRow.fields) {
    stringData[field.key] = String(data[field.key] ?? "");
  }
  return renderDocx(originalDocx, stringData);
}
