import type { TemplateField } from "@/db/schema";
import { normalizeForMatch, stripHeaderHint } from "@/lib/csv";
import { isTruthyValue } from "@/lib/docx-template";

/** The `<select>` value that means "this field isn't mapped to any CSV column". */
export const NOT_MAPPED = "";

/** Where the bulk-fill setup for a template is persisted between visits. */
export const BULK_STATE_STORAGE_PREFIX = "bulkFillState:";

export type BulkSource = "csv" | "edit";
export type OutputFormat = "pdf" | "docx";

/** A cell in the editable-rows table: how to render its input and where its value lives on a row. */
export type EditableColumn = {
  key: string;
  label: string;
  sublabel?: string;
  renderInput: (value: string, onChange: (value: string) => void) => React.ReactNode;
};

/** Everything the bulk form keeps in localStorage so a reload or navigation doesn't lose it. */
export type PersistedBulkState = {
  source: BulkSource;
  fileName: string | null;
  headers: string[];
  csvRows: Record<string, string>[];
  mapping: Record<string, string>;
  editRows: Record<string, string>[];
  nameField: string;
  format: OutputFormat;
};

/** Normalizes a raw string into the canonical form the template's field type expects. */
export function coerceValue(field: TemplateField, raw: string): string {
  const value = raw.trim();
  if (field.type === "boolean" || field.type === "checkbox") {
    return isTruthyValue(value) ? "true" : "false";
  }
  if (field.type === "date" && value !== "" && !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      const yyyy = String(parsed.getFullYear());
      const mm = String(parsed.getMonth() + 1).padStart(2, "0");
      const dd = String(parsed.getDate()).padStart(2, "0");
      return `${yyyy}-${mm}-${dd}`;
    }
  }
  return value;
}

// Fields whose value only ever takes 2-3 distinct options (boolean, checkbox,
// or a small select) make poor file names since many rows would collide.
export function isNameableField(field: TemplateField): boolean {
  if (field.type === "boolean" || field.type === "checkbox") return false;
  if (field.type === "select" && field.params.length <= 3) return false;
  return true;
}

/** Best-effort match of each field to a CSV header by normalized key or label. */
export function autoMapFieldsToHeaders(
  fields: TemplateField[],
  headers: string[]
): Record<string, string> {
  const mapping: Record<string, string> = {};
  for (const field of fields) {
    const match = headers.find((header) => {
      const normalizedHeader = normalizeForMatch(stripHeaderHint(header));
      return (
        normalizedHeader === normalizeForMatch(field.key) ||
        normalizedHeader === normalizeForMatch(field.label)
      );
    });
    mapping[field.key] = match ?? NOT_MAPPED;
  }
  return mapping;
}

export function emptyEditRow(fields: TemplateField[]): Record<string, string> {
  return Object.fromEntries(
    fields.map((f) => [f.key, f.type === "boolean" || f.type === "checkbox" ? "false" : ""])
  );
}

export function emptyRowForHeaders(headers: string[]): Record<string, string> {
  return Object.fromEntries(headers.map((header) => [header, ""]));
}

/** Builds the `{ fieldKey: value }` payload for one row, respecting the current source and column mapping. */
export function buildRowData(
  row: Record<string, string>,
  { source, fields, mapping }: { source: BulkSource; fields: TemplateField[]; mapping: Record<string, string> }
): Record<string, string> {
  const data: Record<string, string> = {};
  for (const field of fields) {
    const isToggle = field.type === "boolean" || field.type === "checkbox";
    if (source === "edit") {
      data[field.key] = coerceValue(field, row[field.key] ?? (isToggle ? "false" : ""));
      continue;
    }
    const header = mapping[field.key];
    data[field.key] = header ? coerceValue(field, row[header] ?? "") : isToggle ? "false" : "";
  }
  return data;
}

/** The raw (un-slugified) value to name a row's output file after, or undefined if blank. */
export function getRowFileName(
  row: Record<string, string>,
  { source, nameField, mapping }: { source: BulkSource; nameField: string; mapping: Record<string, string> }
): string | undefined {
  if (source === "edit") return row[nameField]?.trim() || undefined;
  const nameHeader = mapping[nameField];
  return nameHeader ? row[nameHeader]?.trim() || undefined : undefined;
}
