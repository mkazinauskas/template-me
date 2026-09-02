"use client";

import type { TemplateField } from "@/db/schema";
import { formatRawTag } from "@/lib/template-tag";
import { inputClasses } from "@/components/ui/input";
import { NOT_MAPPED } from "./row-helpers";

/** The "Map columns to fields" list: one `<select>` per template field choosing which CSV column feeds it. */
export function ColumnMappingFields({
  fields,
  headers,
  mapping,
  onChange,
}: {
  fields: TemplateField[];
  headers: string[];
  mapping: Record<string, string>;
  onChange: (fieldKey: string, header: string) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-sm font-semibold">Map columns to fields</h3>
      {fields.map((field) => (
        <div key={field.key} className="flex flex-col gap-1.5">
          <label htmlFor={`map-${field.key}`} className="text-sm font-medium flex items-center gap-2">
            {field.label}
            <code className="text-[10px] normal-case tracking-normal text-black/50 dark:text-white/50 font-mono font-normal">
              {formatRawTag(field)}
            </code>
            <span className="text-[10px] uppercase tracking-wide text-black/50 dark:text-white/50 font-normal">
              {field.type}
            </span>
          </label>
          <select
            id={`map-${field.key}`}
            value={mapping[field.key] ?? NOT_MAPPED}
            onChange={(e) => onChange(field.key, e.target.value)}
            className={inputClasses}
          >
            <option value={NOT_MAPPED}>— Not mapped —</option>
            {headers.map((header) => (
              <option key={header} value={header}>
                {header}
              </option>
            ))}
          </select>
        </div>
      ))}
    </div>
  );
}
