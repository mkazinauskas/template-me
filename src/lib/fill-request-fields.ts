import type { Template, TemplateField } from "@/db/schema";

/**
 * The fields a link's recipient is actually asked for: the template's fields
 * narrowed to the keys picked when the link was created, kept in template
 * order so the form reads the same way as the document. A null (or empty)
 * `fieldKeys` means the link asks for everything — the shape every link had
 * before per-link field selection, and still the default.
 */
export function requestedFields(
  fields: TemplateField[],
  fieldKeys: string[] | null
): TemplateField[] {
  if (!fieldKeys || fieldKeys.length === 0) return fields;
  const wanted = new Set(fieldKeys);
  return fields.filter((f) => wanted.has(f.key));
}

/**
 * A view of the template carrying only the fields a link asks for, for
 * validating that link's submission: everything the recipient wasn't asked
 * for is neither required nor checked. The stored row still gets a value for
 * every field (blank for the ones left out) via `toFieldStrings`, which is
 * given the *full* template.
 */
export function templateForRequest(row: Template, fieldKeys: string[] | null): Template {
  if (!fieldKeys || fieldKeys.length === 0) return row;
  return { ...row, fields: requestedFields(row.fields, fieldKeys) };
}
