"use client";

import type { TemplateField } from "@/db/schema";
import { inputClasses } from "@/components/ui/input";
import { buttonClasses } from "@/components/ui/button";
import type { BulkSource, OutputFormat } from "./row-helpers";

/**
 * The lower half of the setup panel, shown once there are rows to work with:
 * choose how files are named, preview one row, and generate the whole batch.
 */
export function GenerateOptions({
  source,
  nameableFields,
  nameField,
  onNameFieldChange,
  rowCount,
  previewRowIndex,
  onPreviewRowIndexChange,
  onPreview,
  isPreviewLoading,
  unmappedRequired,
  submitError,
  isSubmitting,
  onGenerateAll,
  format,
  onFormatChange,
  onDownloadRows,
}: {
  source: BulkSource;
  nameableFields: TemplateField[];
  nameField: string;
  onNameFieldChange: (key: string) => void;
  rowCount: number;
  previewRowIndex: number;
  onPreviewRowIndexChange: (index: number) => void;
  onPreview: () => void;
  isPreviewLoading: boolean;
  unmappedRequired: TemplateField[];
  submitError: string | null;
  isSubmitting: boolean;
  onGenerateAll: () => void;
  format: OutputFormat;
  onFormatChange: (format: OutputFormat) => void;
  onDownloadRows: () => void;
}) {
  return (
    <>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="name-field" className="text-sm font-medium">
          Name each file using
        </label>
        <select
          id="name-field"
          value={nameField}
          onChange={(e) => onNameFieldChange(e.target.value)}
          className={inputClasses}
        >
          {nameableFields.map((field) => (
            <option key={field.key} value={field.key}>
              {field.label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex items-center gap-2">
        <label htmlFor="preview-row" className="text-sm font-medium shrink-0">
          Preview row
        </label>
        <select
          id="preview-row"
          value={previewRowIndex}
          onChange={(e) => onPreviewRowIndexChange(Number(e.target.value))}
          className={inputClasses}
        >
          {Array.from({ length: rowCount }, (_, i) => (
            <option key={i} value={i}>
              Row {i + 1}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={onPreview}
          disabled={isPreviewLoading}
          className={buttonClasses({ variant: "secondary", size: "sm", className: "shrink-0" })}
        >
          {isPreviewLoading ? "Loading…" : "Preview"}
        </button>
      </div>

      {source === "csv" && unmappedRequired.length > 0 && (
        <p className="text-xs text-amber-700 dark:text-amber-400">
          Not mapped: {unmappedRequired.map((f) => f.label).join(", ")}. Those rows will need a value
          or generation will fail.
        </p>
      )}

      {submitError && (
        <p id="form-error" role="alert" className="text-sm text-red-600 dark:text-red-400">
          {submitError}
        </p>
      )}

      <div className="flex items-center gap-2">
        <button type="button" onClick={onGenerateAll} disabled={isSubmitting} className={buttonClasses()}>
          {isSubmitting
            ? "Generating…"
            : `Generate ${rowCount} document${rowCount === 1 ? "" : "s"}`}
        </button>
        <select
          aria-label="Download format"
          value={format}
          onChange={(e) => onFormatChange(e.target.value as OutputFormat)}
          className={inputClasses}
        >
          <option value="pdf">PDF</option>
          <option value="docx">Word (.docx)</option>
        </select>
        <button
          type="button"
          onClick={onDownloadRows}
          className={buttonClasses({ variant: "secondary", size: "sm" })}
        >
          Download rows as CSV
        </button>
      </div>
    </>
  );
}
