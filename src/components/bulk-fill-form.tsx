"use client";

import { useMemo, useRef, useState } from "react";
import type { TemplateField } from "@/db/schema";
import { parseCsv, normalizeForMatch, buildCsvTemplate, stripHeaderHint } from "@/lib/csv";
import { formatRawTag } from "@/lib/template-tag";

const inputClass =
  "rounded-md border border-black/15 dark:border-white/20 bg-transparent px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/20 dark:focus:ring-white/30";

const NOT_MAPPED = "";

function coerceValue(field: TemplateField, raw: string): string {
  const value = raw.trim();
  if (field.type === "boolean") {
    return ["true", "yes", "y", "1"].includes(value.toLowerCase()) ? "true" : "false";
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
  const [fileName, setFileName] = useState<string | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [nameField, setNameField] = useState<string>(fields[0]?.key ?? "");
  const [parseError, setParseError] = useState<string | null>(null);

  const [previewRowIndex, setPreviewRowIndex] = useState(0);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  function buildRowData(row: Record<string, string>): Record<string, string> {
    const data: Record<string, string> = {};
    for (const field of fields) {
      const header = mapping[field.key];
      data[field.key] = header ? coerceValue(field, row[header] ?? "") : field.type === "boolean" ? "false" : "";
    }
    return data;
  }

  function handleDownloadTemplate() {
    const csv = buildCsvTemplate(fields);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${templateName.replace(/[^a-zA-Z0-9-_]+/g, "_")}_template.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
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
        setRows([]);
        return;
      }
      setFileName(file.name);
      setHeaders(parsed.headers);
      setRows(parsed.rows);
      setMapping(autoMapping(fields, parsed.headers));
      setPreviewRowIndex(0);
    } catch {
      setParseError("Failed to read that file. Please upload a .csv file.");
    }
  }

  async function handlePreview() {
    const row = rows[previewRowIndex];
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
      const payloadRows = rows.map((row) => {
        const data = buildRowData(row);
        const nameHeader = mapping[nameField];
        const rawName = nameHeader ? row[nameHeader] : undefined;
        return { data, filename: rawName?.trim() || undefined };
      });

      const res = await fetch(`/api/templates/${templateId}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: payloadRows }),
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setSubmitError(json.error ?? "Failed to generate documents");
        return;
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${templateName.replace(/[^a-zA-Z0-9-_]+/g, "_")}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      setSubmitError("Failed to generate documents");
    } finally {
      setIsSubmitting(false);
    }
  }

  const unmappedRequired = useMemo(
    () => fields.filter((f) => f.type !== "boolean" && !mapping[f.key]),
    [fields, mapping]
  );

  return (
    <div className="flex h-full min-h-0 flex-col lg:flex-row">
      <div className="flex flex-col gap-4 p-6 overflow-y-auto lg:w-[420px] lg:shrink-0 border-b lg:border-b-0 lg:border-r border-black/10 dark:border-white/15">
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
              {fileName} — {rows.length} row{rows.length === 1 ? "" : "s"}
            </p>
          )}
          {parseError && <p className="text-sm text-red-600 dark:text-red-400">{parseError}</p>}
        </div>

        {rows.length > 0 && (
          <>
            <div className="flex flex-col gap-3">
              <h3 className="text-sm font-semibold">Map columns to fields</h3>
              {fields.map((field) => (
                <div key={field.key} className="flex flex-col gap-1.5">
                  <label htmlFor={`map-${field.key}`} className="text-sm font-medium flex items-center gap-2">
                    {field.label}
                    <code className="text-[10px] normal-case tracking-normal text-black/40 dark:text-white/40 font-mono font-normal">
                      {formatRawTag(field)}
                    </code>
                  </label>
                  <select
                    id={`map-${field.key}`}
                    value={mapping[field.key] ?? NOT_MAPPED}
                    onChange={(e) =>
                      setMapping((prev) => ({ ...prev, [field.key]: e.target.value }))
                    }
                    className={inputClass}
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

            <div className="flex flex-col gap-1.5">
              <label htmlFor="name-field" className="text-sm font-medium">
                Name each file using
              </label>
              <select
                id="name-field"
                value={nameField}
                onChange={(e) => setNameField(e.target.value)}
                className={inputClass}
              >
                {fields.map((field) => (
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
                onChange={(e) => setPreviewRowIndex(Number(e.target.value))}
                className={inputClass}
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
                className="shrink-0 rounded-md border border-black/15 dark:border-white/20 px-3 py-2 text-sm font-medium disabled:opacity-50"
              >
                {isPreviewLoading ? "Loading…" : "Preview"}
              </button>
            </div>

            {unmappedRequired.length > 0 && (
              <p className="text-xs text-amber-700 dark:text-amber-400">
                Not mapped: {unmappedRequired.map((f) => f.label).join(", ")}. Those rows will need a value or generation will fail.
              </p>
            )}

            {submitError && <p className="text-sm text-red-600 dark:text-red-400">{submitError}</p>}

            <button
              type="button"
              onClick={handleGenerateAll}
              disabled={isSubmitting}
              className="self-start rounded-md bg-black text-white dark:bg-white dark:text-black px-4 py-2 text-sm font-medium disabled:opacity-50"
            >
              {isSubmitting ? "Generating…" : `Generate ${rows.length} document${rows.length === 1 ? "" : "s"}`}
            </button>
          </>
        )}
      </div>

      <div className="relative flex-1 min-h-[60vh] lg:min-h-0 bg-zinc-100 dark:bg-zinc-950">
        {previewUrl ? (
          <iframe src={previewUrl} title="Document preview" className="w-full h-full border-0" />
        ) : rows.length > 0 ? (
          <div className="h-full overflow-auto p-4">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr>
                  {headers.map((h) => (
                    <th
                      key={h}
                      className="text-left border-b border-black/10 dark:border-white/15 px-2 py-1.5 font-semibold whitespace-nowrap"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 20).map((row, i) => (
                  <tr key={i} className="odd:bg-black/[0.02] dark:odd:bg-white/[0.03]">
                    {headers.map((h) => (
                      <td key={h} className="px-2 py-1.5 whitespace-nowrap border-b border-black/5 dark:border-white/10">
                        {row[h]}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length > 20 && (
              <p className="mt-2 text-xs text-black/40 dark:text-white/40">
                Showing 20 of {rows.length} rows.
              </p>
            )}
          </div>
        ) : (
          <div className="flex items-center justify-center h-full text-sm text-black/40 dark:text-white/40 text-center px-6">
            Upload a .csv file with one row per document to get started.
          </div>
        )}

        {(isPreviewLoading || previewError) && (
          <div
            className={`absolute top-3 right-3 rounded-md px-3 py-1.5 text-xs font-medium shadow-sm ${
              previewError
                ? "bg-red-600 text-white"
                : "bg-black/80 text-white dark:bg-white/90 dark:text-black"
            }`}
          >
            {previewError ?? "Rendering preview…"}
          </div>
        )}
      </div>
    </div>
  );
}
