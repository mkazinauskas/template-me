import type { TemplateField } from "@/db/schema";

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
  const quoteParams = field.type !== "number";
  const args = field.params.map((p) => (quoteParams ? `"${p}"` : p)).join(", ");
  return `{{${field.key}|${field.type}(${args})}}`;
}
