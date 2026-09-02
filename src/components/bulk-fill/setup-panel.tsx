"use client";

import { useRef, type CSSProperties } from "react";
import type { TemplateField } from "@/db/schema";
import { ColumnMappingFields } from "./column-mapping-fields";
import { GenerateOptions } from "./generate-options";
import type { BulkSource, OutputFormat } from "./row-helpers";

const SOURCE_TABS = [
  { value: "csv", label: "Upload CSV" },
  { value: "edit", label: "Edit in page" },
] as const;

type SetupPanelProps = {
  paneWidth: number;
  source: BulkSource;
  onSourceChange: (next: BulkSource) => void;

  fields: TemplateField[];
  nameableFields: TemplateField[];

  fileName: string | null;
  csvRowCount: number;
  editRowCount: number;
  parseError: string | null;
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onDownloadTemplate: () => void;

  hasRows: boolean;
  headers: string[];
  mapping: Record<string, string>;
  onMappingChange: (fieldKey: string, header: string) => void;
  unmappedRequired: TemplateField[];

  nameField: string;
  onNameFieldChange: (key: string) => void;

  rowCount: number;
  previewRowIndex: number;
  onPreviewRowIndexChange: (index: number) => void;
  onPreview: () => void;
  isPreviewLoading: boolean;

  submitError: string | null;
  isSubmitting: boolean;
  onGenerateAll: () => void;
  format: OutputFormat;
  onFormatChange: (format: OutputFormat) => void;
  onDownloadRows: () => void;
};

/** The left-hand column of the bulk form: pick a source, map columns, choose options, generate. */
export function BulkSetupPanel({
  paneWidth,
  source,
  onSourceChange,
  fields,
  nameableFields,
  fileName,
  csvRowCount,
  editRowCount,
  parseError,
  onFileChange,
  onDownloadTemplate,
  hasRows,
  headers,
  mapping,
  onMappingChange,
  unmappedRequired,
  nameField,
  onNameFieldChange,
  rowCount,
  previewRowIndex,
  onPreviewRowIndexChange,
  onPreview,
  isPreviewLoading,
  submitError,
  isSubmitting,
  onGenerateAll,
  format,
  onFormatChange,
  onDownloadRows,
}: SetupPanelProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  return (
    <div
      style={{ "--form-width": `${paneWidth}px` } as CSSProperties}
      aria-describedby={
        [parseError && "csv-parse-error", submitError && "form-error"].filter(Boolean).join(" ") ||
        undefined
      }
      className="flex flex-col gap-4 p-6 overflow-y-auto lg:w-[var(--form-width)] lg:shrink-0 border-b lg:border-b-0 border-black/10 dark:border-white/15"
    >
      <div className="flex items-center gap-1 rounded-md bg-black/5 dark:bg-white/10 p-1 self-start">
        {SOURCE_TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            onClick={() => onSourceChange(tab.value)}
            className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
              source === tab.value
                ? "bg-black text-white dark:bg-white dark:text-black"
                : "text-muted-foreground hover:bg-black/10 dark:hover:bg-white/10"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {source === "csv" ? (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between gap-2">
            <label htmlFor="csv-file" className="text-sm font-medium">
              Spreadsheet (.csv, one row per document)
            </label>
            <button
              type="button"
              onClick={onDownloadTemplate}
              className="shrink-0 text-xs font-medium underline underline-offset-2 text-muted-foreground hover:text-black dark:hover:text-white"
            >
              Download CSV template
            </button>
          </div>
          <input
            id="csv-file"
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            onChange={onFileChange}
            className="text-sm file:mr-3 file:rounded-md file:border-0 file:bg-black/90 file:text-white dark:file:bg-white dark:file:text-black file:px-3 file:py-2 file:text-sm file:font-medium file:cursor-pointer cursor-pointer"
          />
          {fileName && (
            <p className="text-xs text-black/50 dark:text-white/50">
              {fileName} — {csvRowCount} row{csvRowCount === 1 ? "" : "s"}
            </p>
          )}
          {parseError && (
            <p id="csv-parse-error" role="alert" className="text-sm text-red-600 dark:text-red-400">
              {parseError}
            </p>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          <p className="text-sm font-medium">Enter rows directly</p>
          <p className="text-xs text-black/50 dark:text-white/50">
            Edit values in the table and use “+ Add row” to add another document. {editRowCount} row
            {editRowCount === 1 ? "" : "s"}.
          </p>
        </div>
      )}

      {hasRows && (
        <>
          {source === "csv" && (
            <ColumnMappingFields
              fields={fields}
              headers={headers}
              mapping={mapping}
              onChange={onMappingChange}
            />
          )}

          <GenerateOptions
            source={source}
            nameableFields={nameableFields}
            nameField={nameField}
            onNameFieldChange={onNameFieldChange}
            rowCount={rowCount}
            previewRowIndex={previewRowIndex}
            onPreviewRowIndexChange={onPreviewRowIndexChange}
            onPreview={onPreview}
            isPreviewLoading={isPreviewLoading}
            unmappedRequired={unmappedRequired}
            submitError={submitError}
            isSubmitting={isSubmitting}
            onGenerateAll={onGenerateAll}
            format={format}
            onFormatChange={onFormatChange}
            onDownloadRows={onDownloadRows}
          />
        </>
      )}
    </div>
  );
}
