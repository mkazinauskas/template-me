"use client";

import { useMemo, useState } from "react";
import type { TemplateField } from "@/db/schema";
import { buildCsvTemplate, rowsToCsv, parseCsv } from "@/lib/csv";
import { formatRawTag } from "@/lib/template-tag";
import { useResizablePaneWidth, ResizeHandle } from "@/hooks/use-resizable-pane-width";
import { downloadBlob } from "@/lib/download";
import { slugifyFilename } from "@/lib/slugify";
import { BulkSetupPanel } from "@/components/bulk-fill/setup-panel";
import { ResultsPreviewPane } from "@/components/bulk-fill/results-preview-pane";
import { buildCsvColumns, buildEditColumns } from "@/components/bulk-fill/columns";
import { usePersistedBulkState } from "@/components/bulk-fill/use-persisted-bulk-state";
import { useBulkGenerate } from "@/components/bulk-fill/use-bulk-generate";
import {
  autoMapFieldsToHeaders,
  emptyEditRow,
  emptyRowForHeaders,
  isNameableField,
  type BulkSource,
  type OutputFormat,
} from "@/components/bulk-fill/row-helpers";

function downloadCsv(filename: string, content: string) {
  downloadBlob(new Blob([content], { type: "text/csv;charset=utf-8;" }), filename);
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
  const [source, setSource] = useState<BulkSource>("csv");
  const [fileName, setFileName] = useState<string | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [csvRows, setCsvRows] = useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [editRows, setEditRows] = useState<Record<string, string>[]>(() => [emptyEditRow(fields)]);

  const nameableFields = useMemo(() => {
    const filtered = fields.filter(isNameableField);
    return filtered.length > 0 ? filtered : fields;
  }, [fields]);
  const defaultNameField = nameableFields[0]?.key ?? "";

  const [nameField, setNameField] = useState<string>(defaultNameField);
  const [parseError, setParseError] = useState<string | null>(null);
  const [previewRowIndex, setPreviewRowIndex] = useState(0);
  const [format, setFormat] = useState<OutputFormat>("pdf");

  const { width: paneWidth, containerRef, startResizing, resetWidth } = useResizablePaneWidth();
  const generate = useBulkGenerate(templateId, templateName);

  usePersistedBulkState(
    templateId,
    fields,
    defaultNameField,
    { source, fileName, headers, csvRows, mapping, editRows, nameField, format },
    { setSource, setFileName, setHeaders, setCsvRows, setMapping, setEditRows, setNameField, setFormat }
  );

  const rows = source === "csv" ? csvRows : editRows;
  // Clamp instead of storing the clamped value: rows can shrink (e.g. a row
  // deleted from editRows) without previewRowIndex being reset explicitly.
  const previewIndex = Math.min(previewRowIndex, Math.max(rows.length - 1, 0));
  const rowContext = { source, fields, mapping, nameField };

  const editColumns = useMemo(() => buildEditColumns(fields), [fields]);
  const csvColumns = useMemo(() => buildCsvColumns(headers), [headers]);
  const unmappedRequired = useMemo(
    () => fields.filter((f) => f.type !== "boolean" && f.type !== "checkbox" && !mapping[f.key]),
    [fields, mapping]
  );

  function handleSourceChange(next: BulkSource) {
    if (next === source) return;
    setSource(next);
    setPreviewRowIndex(0);
    generate.reset();
  }

  function handleDownloadTemplate() {
    downloadCsv(`${slugifyFilename(templateName)}_template.csv`, buildCsvTemplate(fields));
  }

  function handleDownloadRows() {
    const outHeaders = source === "edit" ? fields.map((f) => formatRawTag(f)) : headers;
    const outRows =
      source === "edit"
        ? editRows.map((row) =>
            Object.fromEntries(fields.map((f, i) => [outHeaders[i], row[f.key] ?? ""]))
          )
        : csvRows;
    downloadCsv(`${slugifyFilename(templateName)}_rows.csv`, rowsToCsv(outHeaders, outRows));
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setParseError(null);
    generate.closePreview();
    try {
      const parsed = parseCsv(await file.text());
      if (parsed.headers.length === 0 || parsed.rows.length === 0) {
        setParseError(
          "Couldn't find any rows in that file. Make sure the first row has column headers."
        );
        setHeaders([]);
        setCsvRows([]);
        return;
      }
      setFileName(file.name);
      setHeaders(parsed.headers);
      setCsvRows(parsed.rows);
      setMapping(autoMapFieldsToHeaders(fields, parsed.headers));
      setPreviewRowIndex(0);
    } catch {
      setParseError("Failed to read that file. Please upload a .csv file.");
    }
  }

  return (
    <div ref={containerRef} className="flex h-full min-h-0 flex-col lg:flex-row">
      <BulkSetupPanel
        paneWidth={paneWidth}
        source={source}
        onSourceChange={handleSourceChange}
        fields={fields}
        nameableFields={nameableFields}
        fileName={fileName}
        csvRowCount={csvRows.length}
        editRowCount={editRows.length}
        parseError={parseError}
        onFileChange={handleFileChange}
        onDownloadTemplate={handleDownloadTemplate}
        hasRows={rows.length > 0}
        headers={headers}
        mapping={mapping}
        onMappingChange={(fieldKey, header) => setMapping((prev) => ({ ...prev, [fieldKey]: header }))}
        unmappedRequired={unmappedRequired}
        nameField={nameField}
        onNameFieldChange={setNameField}
        rowCount={rows.length}
        previewRowIndex={previewIndex}
        onPreviewRowIndexChange={setPreviewRowIndex}
        onPreview={() => generate.preview(rows[previewIndex], rowContext)}
        isPreviewLoading={generate.isPreviewLoading}
        submitError={generate.submitError}
        isSubmitting={generate.isSubmitting}
        onGenerateAll={() => generate.generateAll(rows, format, rowContext)}
        format={format}
        onFormatChange={setFormat}
        onDownloadRows={handleDownloadRows}
      />

      <ResizeHandle onPointerDown={startResizing} onReset={resetWidth} />

      <ResultsPreviewPane
        source={source}
        previewUrl={generate.previewUrl}
        isPreviewLoading={generate.isPreviewLoading}
        previewError={generate.previewError}
        onClosePreview={generate.closePreview}
        editColumns={editColumns}
        editRows={editRows}
        onEditRowsChange={setEditRows}
        makeEmptyEditRow={() => emptyEditRow(fields)}
        csvColumns={csvColumns}
        csvRows={csvRows}
        onCsvRowsChange={setCsvRows}
        makeEmptyCsvRow={() => emptyRowForHeaders(headers)}
        hasHeaders={headers.length > 0}
      />
    </div>
  );
}
