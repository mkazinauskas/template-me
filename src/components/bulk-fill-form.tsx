"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import type { TemplateField } from "@/db/schema";
import { parseCsv, normalizeForMatch, buildCsvTemplate, rowsToCsv, stripHeaderHint } from "@/lib/csv";
import { isTruthyValue } from "@/lib/docx-template";
import { formatRawTag } from "@/lib/template-tag";
import { useResizablePaneWidth, ResizeHandle } from "@/hooks/use-resizable-pane-width";
import { FieldInput } from "@/components/field-input";
import { DocumentPreviewPane } from "@/components/document-preview-pane";
import { inputClasses, compactInputClasses } from "@/components/ui/input";
import { buttonClasses } from "@/components/ui/button";
import { downloadBlob } from "@/lib/download";
import { slugifyFilename } from "@/lib/slugify";

const BULK_STATE_STORAGE_PREFIX = "bulkFillState:";

type PersistedBulkState = {
  source: "csv" | "edit";
  fileName: string | null;
  headers: string[];
  csvRows: Record<string, string>[];
  mapping: Record<string, string>;
  editRows: Record<string, string>[];
  nameField: string;
  format: "pdf" | "docx";
};

const NOT_MAPPED = "";

type EditableColumn = {
  key: string;
  label: string;
  sublabel?: string;
  renderInput: (value: string, onChange: (value: string) => void) => ReactNode;
};

function coerceValue(field: TemplateField, raw: string): string {
  const value = raw.trim();
  if (field.type === "boolean" || field.type === "checkbox") {
    return isTruthyValue(value) ? "true" : "false";
  }
  if (field.type === "date" && value !== "" && !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      const yyyy = String(parsed.getFullYear());
      const mm = String(parsed.getMonth() + 1).padStart(2, "0");
      const dd = String(parsed.getDate()).padStart(2, "0");
      return `${yyyy}-${mm}-${dd}`;
    }
  }
  return value;
}

// Fields whose value only ever takes 2-3 distinct options (boolean, checkbox,
// or a small select) make poor file names since many rows would collide.
function isNameable(field: TemplateField): boolean {
  if (field.type === "boolean" || field.type === "checkbox") return false;
  if (field.type === "select" && field.params.length <= 3) return false;
  return true;
}

function autoMapping(fields: TemplateField[], headers: string[]): Record<string, string> {
  const mapping: Record<string, string> = {};
  for (const field of fields) {
    const match = headers.find((h) => {
      const normalizedHeader = normalizeForMatch(stripHeaderHint(h));
      return normalizedHeader === normalizeForMatch(field.key) || normalizedHeader === normalizeForMatch(field.label);
    });
    mapping[field.key] = match ?? NOT_MAPPED;
  }
  return mapping;
}

function emptyEditRow(fields: TemplateField[]): Record<string, string> {
  return Object.fromEntries(
    fields.map((f) => [f.key, f.type === "boolean" || f.type === "checkbox" ? "false" : ""])
  );
}

function emptyRowForHeaders(headers: string[]): Record<string, string> {
  return Object.fromEntries(headers.map((h) => [h, ""]));
}

function downloadTextFile(filename: string, content: string, mimeType: string) {
  downloadBlob(new Blob([content], { type: mimeType }), filename);
}

function EditableRowsTable({
  columns,
  rows,
  onRowsChange,
  makeEmptyRow,
}: {
  columns: EditableColumn[];
  rows: Record<string, string>[];
  onRowsChange: (rows: Record<string, string>[]) => void;
  makeEmptyRow: () => Record<string, string>;
}) {
  function updateCell(rowIndex: number, key: string, value: string) {
    onRowsChange(rows.map((row, i) => (i === rowIndex ? { ...row, [key]: value } : row)));
  }
  function removeRow(rowIndex: number) {
    onRowsChange(rows.filter((_, i) => i !== rowIndex));
  }
  function addRow() {
    onRowsChange([...rows, makeEmptyRow()]);
  }

  return (
    <div className="h-full overflow-auto p-4">
      <table className="border-collapse text-xs">
        <thead>
          <tr>
            <th className="text-left border-b border-black/10 dark:border-white/15 px-2 py-1.5 font-semibold w-8">
              #
            </th>
            {columns.map((col) => (
              <th
                key={col.key}
                className="text-left border-b border-black/10 dark:border-white/15 px-2 py-1.5 font-semibold whitespace-nowrap"
              >
                <div className="flex items-center gap-1.5">
                  {col.label}
                  {col.sublabel && (
                    <code className="text-[10px] normal-case tracking-normal text-black/50 dark:text-white/50 font-mono font-normal">
                      {col.sublabel}
                    </code>
                  )}
                </div>
              </th>
            ))}
            <th className="border-b border-black/10 dark:border-white/15 px-2 py-1.5 w-8" />
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="odd:bg-black/[0.02] dark:odd:bg-white/[0.03]">
              <td className="px-2 py-1.5 border-b border-black/5 dark:border-white/10 text-black/50 dark:text-white/50">
                {i + 1}
              </td>
              {columns.map((col) => (
                <td key={col.key} className="px-2 py-1.5 border-b border-black/5 dark:border-white/10">
                  {col.renderInput(row[col.key] ?? "", (value) => updateCell(i, col.key, value))}
                </td>
              ))}
              <td className="px-2 py-1.5 border-b border-black/5 dark:border-white/10">
                <button
                  type="button"
                  onClick={() => removeRow(i)}
                  aria-label={`Remove row ${i + 1}`}
                  className="text-black/40 dark:text-white/40 hover:text-red-600 dark:hover:text-red-400"
                >
                  ✕
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button
        type="button"
        onClick={addRow}
        className="mt-3 rounded-md border border-dashed border-black/20 dark:border-white/25 px-3 py-1.5 text-xs font-medium text-black/60 dark:text-white/60 hover:border-black/40 dark:hover:border-white/40 hover:text-black dark:hover:text-white"
      >
        + Add row
      </button>
    </div>
  );
}

export function BulkFillForm({
  templateId,
  fields,
  templateName,
}: {
  templateId: string;
  fields: TemplateField[];
  templateName: string;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const storageKey = BULK_STATE_STORAGE_PREFIX + templateId;
  const [source, setSource] = useState<"csv" | "edit">("csv");

  const [fileName, setFileName] = useState<string | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [csvRows, setCsvRows] = useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});

  const [editRows, setEditRows] = useState<Record<string, string>[]>(() => [emptyEditRow(fields)]);

  const nameableFields = useMemo(() => {
    const filtered = fields.filter(isNameable);
    return filtered.length > 0 ? filtered : fields;
  }, [fields]);

  const [nameField, setNameField] = useState<string>(nameableFields[0]?.key ?? "");
  const [parseError, setParseError] = useState<string | null>(null);

  const [previewRowIndex, setPreviewRowIndex] = useState(0);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [format, setFormat] = useState<"pdf" | "docx">("pdf");

  const { width: paneWidth, containerRef, startResizing, resetWidth } = useResizablePaneWidth();

  // Restore previously uploaded/edited rows for this template, so navigating
  // away and back (or a reload) doesn't lose what was set up.
  useEffect(() => {
    // Deferred to after mount (rather than a lazy useState initializer) so the
    // first client render matches the server-rendered defaults — reading
    // localStorage during the initial render would cause a hydration mismatch.
    try {
      const stored = localStorage.getItem(storageKey);
      if (!stored) return;
      const parsed = JSON.parse(stored) as Partial<PersistedBulkState>;
      const fieldKeys = new Set(fields.map((f) => f.key));
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (parsed.source) setSource(parsed.source);
      if (parsed.fileName !== undefined) setFileName(parsed.fileName);
      if (parsed.headers) setHeaders(parsed.headers);
      if (parsed.csvRows) setCsvRows(parsed.csvRows);
      if (parsed.mapping) {
        // The template may have been edited (fields renamed/removed) since
        // this mapping was persisted — drop entries pointing at field keys
        // that no longer exist so we don't silently reference stale fields.
        const prunedMapping = Object.fromEntries(
          Object.entries(parsed.mapping).filter(([fieldKey]) => fieldKeys.has(fieldKey))
        );
        setMapping(prunedMapping);
      }
      if (parsed.editRows && parsed.editRows.length > 0) setEditRows(parsed.editRows);
      // Only restore nameField if it's still a valid field key; otherwise
      // fall back to the same default used on first mount, since a stale
      // value would silently fail to match any <option> in the select.
      if (parsed.nameField && fieldKeys.has(parsed.nameField)) {
        setNameField(parsed.nameField);
      } else if (parsed.nameField) {
        setNameField(nameableFields[0]?.key ?? "");
      }
      if (parsed.format) setFormat(parsed.format);
    } catch {
      // Ignore malformed/unavailable storage and fall back to defaults.
    }
  }, [storageKey]);

  useEffect(() => {
    const state: PersistedBulkState = {
      source,
      fileName,
      headers,
      csvRows,
      mapping,
      editRows,
      nameField,
      format,
    };
    try {
      localStorage.setItem(storageKey, JSON.stringify(state));
    } catch {
      // Ignore storage failures (e.g. private browsing quota).
    }
  }, [storageKey, source, fileName, headers, csvRows, mapping, editRows, nameField, format]);

  const rows = source === "csv" ? csvRows : editRows;
  // Clamp instead of storing the clamped value: rows can shrink (e.g. a row
  // deleted from editRows) without previewRowIndex being reset explicitly.
  const clampedPreviewRowIndex = Math.min(previewRowIndex, Math.max(rows.length - 1, 0));

  const editColumns = useMemo<EditableColumn[]>(
    () =>
      fields.map((field) => ({
        key: field.key,
        label: field.label,
        sublabel: formatRawTag(field),
        renderInput: (value, onChange) => (
          <FieldInput field={field} aria-label={field.label} value={value} onChange={onChange} />
        ),
      })),
    [fields]
  );

  const csvColumns = useMemo<EditableColumn[]>(
    () =>
      headers.map((header) => ({
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
      })),
    [headers]
  );

  function handleSourceChange(next: "csv" | "edit") {
    if (next === source) return;
    setSource(next);
    setPreviewUrl(null);
    setPreviewError(null);
    setSubmitError(null);
    setPreviewRowIndex(0);
  }

  function buildRowData(row: Record<string, string>): Record<string, string> {
    const data: Record<string, string> = {};
    for (const field of fields) {
      const isToggle = field.type === "boolean" || field.type === "checkbox";
      if (source === "edit") {
        data[field.key] = coerceValue(field, row[field.key] ?? (isToggle ? "false" : ""));
        continue;
      }
      const header = mapping[field.key];
      data[field.key] = header ? coerceValue(field, row[header] ?? "") : isToggle ? "false" : "";
    }
    return data;
  }

  function getRawName(row: Record<string, string>): string | undefined {
    if (source === "edit") return row[nameField]?.trim() || undefined;
    const nameHeader = mapping[nameField];
    return nameHeader ? row[nameHeader]?.trim() || undefined : undefined;
  }

  function handleDownloadTemplate() {
    downloadTextFile(
      `${slugifyFilename(templateName)}_template.csv`,
      buildCsvTemplate(fields),
      "text/csv;charset=utf-8;"
    );
  }

  function handleDownloadRows() {
    const outHeaders = source === "edit" ? fields.map((f) => formatRawTag(f)) : headers;
    const outRows =
      source === "edit"
        ? editRows.map((row) =>
            Object.fromEntries(fields.map((f, i) => [outHeaders[i], row[f.key] ?? ""]))
          )
        : csvRows;
    downloadTextFile(
      `${slugifyFilename(templateName)}_rows.csv`,
      rowsToCsv(outHeaders, outRows),
      "text/csv;charset=utf-8;"
    );
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setParseError(null);
    setSubmitError(null);
    setPreviewUrl(null);
    try {
      const text = await file.text();
      const parsed = parseCsv(text);
      if (parsed.headers.length === 0 || parsed.rows.length === 0) {
        setParseError("Couldn't find any rows in that file. Make sure the first row has column headers.");
        setHeaders([]);
        setCsvRows([]);
        return;
      }
      setFileName(file.name);
      setHeaders(parsed.headers);
      setCsvRows(parsed.rows);
      setMapping(autoMapping(fields, parsed.headers));
      setPreviewRowIndex(0);
    } catch {
      setParseError("Failed to read that file. Please upload a .csv file.");
    }
  }

  function handleClosePreview() {
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setPreviewError(null);
  }

  async function handlePreview() {
    const row = rows[clampedPreviewRowIndex];
    if (!row) return;
    setIsPreviewLoading(true);
    setPreviewError(null);
    try {
      const res = await fetch(`/api/templates/${templateId}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: buildRowData(row), preview: true }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setPreviewError(json.error ?? "Failed to render preview");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      setPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return url;
      });
    } catch {
      setPreviewError("Failed to render preview");
    } finally {
      setIsPreviewLoading(false);
    }
  }

  async function handleGenerateAll() {
    setSubmitError(null);
    setIsSubmitting(true);
    try {
      const payloadRows = rows.map((row) => ({
        data: buildRowData(row),
        filename: getRawName(row),
      }));

      const res = await fetch(`/api/templates/${templateId}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: payloadRows, format }),
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setSubmitError(json.error ?? "Failed to generate documents");
        return;
      }

      const blob = await res.blob();
      downloadBlob(blob, `${slugifyFilename(templateName)}.zip`);
    } catch {
      setSubmitError("Failed to generate documents");
    } finally {
      setIsSubmitting(false);
    }
  }

  const unmappedRequired = useMemo(
    () => fields.filter((f) => f.type !== "boolean" && f.type !== "checkbox" && !mapping[f.key]),
    [fields, mapping]
  );

  return (
    <div ref={containerRef} className="flex h-full min-h-0 flex-col lg:flex-row">
      <div
        style={{ "--form-width": `${paneWidth}px` } as CSSProperties}
        aria-describedby={
          [parseError && "csv-parse-error", submitError && "form-error"].filter(Boolean).join(" ") ||
          undefined
        }
        className="flex flex-col gap-4 p-6 overflow-y-auto lg:w-[var(--form-width)] lg:shrink-0 border-b lg:border-b-0 border-black/10 dark:border-white/15"
      >
        <div className="flex items-center gap-1 rounded-md bg-black/5 dark:bg-white/10 p-1 self-start">
          {(
            [
              { value: "csv", label: "Upload CSV" },
              { value: "edit", label: "Edit in page" },
            ] as const
          ).map((tab) => (
            <button
              key={tab.value}
              type="button"
              onClick={() => handleSourceChange(tab.value)}
              className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                source === tab.value
                  ? "bg-black text-white dark:bg-white dark:text-black"
                  : "text-black/60 dark:text-white/60 hover:bg-black/10 dark:hover:bg-white/10"
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
                onClick={handleDownloadTemplate}
                className="shrink-0 text-xs font-medium underline underline-offset-2 text-black/60 dark:text-white/60 hover:text-black dark:hover:text-white"
              >
                Download CSV template
              </button>
            </div>
            <input
              id="csv-file"
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              onChange={handleFileChange}
              className="text-sm file:mr-3 file:rounded-md file:border-0 file:bg-black/90 file:text-white dark:file:bg-white dark:file:text-black file:px-3 file:py-2 file:text-sm file:font-medium file:cursor-pointer cursor-pointer"
            />
            {fileName && (
              <p className="text-xs text-black/50 dark:text-white/50">
                {fileName} — {csvRows.length} row{csvRows.length === 1 ? "" : "s"}
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
              Edit values in the table and use “+ Add row” to add another document. {editRows.length} row
              {editRows.length === 1 ? "" : "s"}.
            </p>
          </div>
        )}

        {rows.length > 0 && (
          <>
            {source === "csv" && (
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
                      onChange={(e) =>
                        setMapping((prev) => ({ ...prev, [field.key]: e.target.value }))
                      }
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
            )}

            <div className="flex flex-col gap-1.5">
              <label htmlFor="name-field" className="text-sm font-medium">
                Name each file using
              </label>
              <select
                id="name-field"
                value={nameField}
                onChange={(e) => setNameField(e.target.value)}
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
                value={clampedPreviewRowIndex}
                onChange={(e) => setPreviewRowIndex(Number(e.target.value))}
                className={inputClasses}
              >
                {rows.map((_, i) => (
                  <option key={i} value={i}>
                    Row {i + 1}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={handlePreview}
                disabled={isPreviewLoading}
                className={buttonClasses({ variant: "secondary", size: "sm", className: "shrink-0" })}
              >
                {isPreviewLoading ? "Loading…" : "Preview"}
              </button>
            </div>

            {source === "csv" && unmappedRequired.length > 0 && (
              <p className="text-xs text-amber-700 dark:text-amber-400">
                Not mapped: {unmappedRequired.map((f) => f.label).join(", ")}. Those rows will need a value or generation will fail.
              </p>
            )}

            {submitError && (
              <p id="form-error" role="alert" className="text-sm text-red-600 dark:text-red-400">
                {submitError}
              </p>
            )}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleGenerateAll}
                disabled={isSubmitting}
                className={buttonClasses()}
              >
                {isSubmitting ? "Generating…" : `Generate ${rows.length} document${rows.length === 1 ? "" : "s"}`}
              </button>
              <select
                aria-label="Download format"
                value={format}
                onChange={(e) => setFormat(e.target.value as "pdf" | "docx")}
                className={inputClasses}
              >
                <option value="pdf">PDF</option>
                <option value="docx">Word (.docx)</option>
              </select>
              <button
                type="button"
                onClick={handleDownloadRows}
                className={buttonClasses({ variant: "secondary", size: "sm" })}
              >
                Download rows as CSV
              </button>
            </div>
          </>
        )}
      </div>

      <ResizeHandle onPointerDown={startResizing} onReset={resetWidth} />

      <DocumentPreviewPane
        url={previewUrl}
        loading={isPreviewLoading}
        error={previewError}
        loadingLabel="Rendering preview…"
        previewActions={
          <button
            type="button"
            onClick={handleClosePreview}
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
              onRowsChange={setEditRows}
              makeEmptyRow={() => emptyEditRow(fields)}
            />
          ) : headers.length > 0 ? (
            <EditableRowsTable
              columns={csvColumns}
              rows={csvRows}
              onRowsChange={setCsvRows}
              makeEmptyRow={() => emptyRowForHeaders(headers)}
            />
          ) : (
            <div className="flex items-center justify-center h-full text-sm text-black/50 dark:text-white/50 text-center px-6">
              Upload a .csv file with one row per document to get started.
            </div>
          )
        }
      />
    </div>
  );
}
