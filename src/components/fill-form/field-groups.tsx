"use client";

import type { TemplateField } from "@/db/schema";
import { FieldInput } from "@/components/field-input";
import { formatRawTag } from "@/lib/template-tag";
import { groupFields } from "./field-grouping";

function FieldRow({
  field,
  value,
  showMeta,
  onChange,
}: {
  field: TemplateField;
  value: string;
  showMeta: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={field.key} className="text-sm font-medium flex items-center gap-2">
        {field.label}
        {showMeta && (
          <>
            <code className="text-[10px] normal-case tracking-normal text-muted-foreground font-mono font-normal">
              {formatRawTag(field)}
            </code>
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground font-normal">
              {field.type}
            </span>
          </>
        )}
      </label>
      <FieldInput field={field} id={field.key} required value={value} onChange={onChange} />
    </div>
  );
}

/**
 * Renders every field, wrapping grouped runs of fields in a labelled
 * `<fieldset>`.
 *
 * `showMeta` puts the raw `{{tag}}` and its type beside each label. That's
 * authoring detail — useful to the owner, who is matching the form back to
 * the document — so it's on by default but switched off for the public fill
 * link, where the recipient has never seen the template and the label alone
 * is the whole question.
 */
export function FieldGroups({
  fields,
  values,
  showMeta = true,
  onFieldChange,
}: {
  fields: TemplateField[];
  values: Record<string, string>;
  showMeta?: boolean;
  onFieldChange: (key: string, value: string) => void;
}) {
  return (
    <>
      {groupFields(fields).map((bucket, i) => {
        const rows = bucket.fields.map((field) => (
          <FieldRow
            key={field.key}
            field={field}
            value={values[field.key] ?? ""}
            showMeta={showMeta}
            onChange={(value) => onFieldChange(field.key, value)}
          />
        ));

        if (!bucket.groupLabel) return rows;

        return (
          <fieldset
            key={bucket.groupLabel + i}
            className="flex flex-col gap-4 rounded-lg border border-border p-4"
          >
            <legend className="text-sm font-semibold px-1">{bucket.groupLabel}</legend>
            {rows}
          </fieldset>
        );
      })}
    </>
  );
}
