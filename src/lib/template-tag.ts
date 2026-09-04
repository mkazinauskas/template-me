import type { TemplateField, TemplateFieldType } from "@/db/schema";

/** Param positions (0-indexed) that hold a bare number rather than a quoted string, per type. */
const NUMERIC_PARAM_INDEXES: Partial<Record<TemplateFieldType, number[]>> = {
  number: [0],
  currency: [1],
};

/**
 * Reconstructs the raw `{{key|type(...)}}` docx tag for a field, mirroring
 * the syntax `extractFields` (in docx-template.ts) parses. A bare string
 * field with no params renders as `{{key}}`.
 */
export function formatRawTag(field: TemplateField): string {
  if (field.type === "string" && field.params.length === 0) {
    return `{{${field.key}}}`;
  }
  if (field.params.length === 0) {
    return `{{${field.key}|${field.type}}}`;
  }
  const numericIndexes = NUMERIC_PARAM_INDEXES[field.type] ?? [];
  const args = field.params
    .map((p, i) => (numericIndexes.includes(i) ? p : `"${p}"`))
    .join(", ");
  return `{{${field.key}|${field.type}(${args})}}`;
}
