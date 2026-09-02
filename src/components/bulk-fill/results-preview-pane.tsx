"use client";

import { DocumentPreviewPane } from "@/components/document-preview-pane";
import { EditableRowsTable } from "./editable-rows-table";
import type { BulkSource, EditableColumn } from "./row-helpers";

/**
 * The right-hand pane of the bulk form. Shows the rendered PDF preview when one
 * exists, and otherwise the editable rows grid (or an upload prompt when no CSV
 * has been loaded yet).
 */
export function ResultsPreviewPane({
  source,
  previewUrl,
  isPreviewLoading,
  previewError,
  onClosePreview,
  editColumns,
  editRows,
  onEditRowsChange,
  makeEmptyEditRow,
  csvColumns,
  csvRows,
  onCsvRowsChange,
  makeEmptyCsvRow,
  hasHeaders,
}: {
  source: BulkSource;
  previewUrl: string | null;
  isPreviewLoading: boolean;
  previewError: string | null;
  onClosePreview: () => void;
  editColumns: EditableColumn[];
  editRows: Record<string, string>[];
  onEditRowsChange: (rows: Record<string, string>[]) => void;
  makeEmptyEditRow: () => Record<string, string>;
  csvColumns: EditableColumn[];
  csvRows: Record<string, string>[];
  onCsvRowsChange: (rows: Record<string, string>[]) => void;
  makeEmptyCsvRow: () => Record<string, string>;
  hasHeaders: boolean;
}) {
  return (
    <DocumentPreviewPane
      url={previewUrl}
      loading={isPreviewLoading}
      error={previewError}
      loadingLabel="Rendering preview…"
      previewActions={
        <button
          type="button"
          onClick={onClosePreview}
          className="absolute top-3 left-3 z-10 rounded-md bg-black/80 text-white dark:bg-white/90 dark:text-black px-3 py-1.5 text-xs font-medium shadow-sm hover:bg-black dark:hover:bg-white"
        >
          ← Back to editing
        </button>
      }
      emptyState={
        source === "edit" ? (
          <EditableRowsTable
            columns={editColumns}
            rows={editRows}
            onRowsChange={onEditRowsChange}
            makeEmptyRow={makeEmptyEditRow}
          />
        ) : hasHeaders ? (
          <EditableRowsTable
            columns={csvColumns}
            rows={csvRows}
            onRowsChange={onCsvRowsChange}
            makeEmptyRow={makeEmptyCsvRow}
          />
        ) : (
          <div className="flex items-center justify-center h-full text-sm text-black/50 dark:text-white/50 text-center px-6">
            Upload a .csv file with one row per document to get started.
          </div>
        )
      }
    />
  );
}
