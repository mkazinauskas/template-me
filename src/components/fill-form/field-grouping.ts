import type { TemplateField } from "@/db/schema";

export type FieldBucket = { groupLabel?: string; fields: TemplateField[] };

export function defaultValueFor(field: TemplateField): string {
  if (field.type === "boolean" || field.type === "checkbox") return "false";
  return "";
}

/** A `{ fieldKey: "" }` map covering every field, used as the form's initial state. */
export function blankValues(fields: TemplateField[]): Record<string, string> {
  return Object.fromEntries(fields.map((f) => [f.key, defaultValueFor(f)]));
}

/**
 * Buckets fields by `group`, keeping each group's fields together (wherever they
 * appear in the template) while preserving each bucket's first-seen order.
 * Ungrouped fields each get their own single-field bucket with no label.
 */
export function groupFields(fields: TemplateField[]): FieldBucket[] {
  const order: string[] = [];
  const buckets = new Map<string, FieldBucket>();
  fields.forEach((field, i) => {
    const bucketKey = field.group ?? `__ungrouped_${i}`;
    let bucket = buckets.get(bucketKey);
    if (!bucket) {
      bucket = { groupLabel: field.groupLabel, fields: [] };
      buckets.set(bucketKey, bucket);
      order.push(bucketKey);
    }
    bucket.fields.push(field);
  });
  return order.map((bucketKey) => buckets.get(bucketKey)!);
}
