"use client";

import type { TemplateField } from "@/db/schema";
import { formatRawTag } from "@/lib/template-tag";
import { FieldInput } from "@/components/field-input";
import { compactInputClasses } from "@/components/ui/input";
import type { EditableColumn } from "./row-helpers";

/** One typed {@link FieldInput} per template field, keyed by the field's own key. */
export function buildEditColumns(fields: TemplateField[]): EditableColumn[] {
  return fields.map((field) => ({
    key: field.key,
    label: field.label,
    sublabel: formatRawTag(field),
    renderInput: (value, onChange) => (
      <FieldInput field={field} aria-label={field.label} value={value} onChange={onChange} />
    ),
  }));
}

/** One plain text input per CSV header, keyed by the header text. */
export function buildCsvColumns(headers: string[]): EditableColumn[] {
  return headers.map((header) => ({
    key: header,
    label: header,
    renderInput: (value, onChange) => (
      <input
        type="text"
        aria-label={header}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={compactInputClasses}
      />
    ),
  }));
}
