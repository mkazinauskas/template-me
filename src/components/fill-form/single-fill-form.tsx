"use client";

import { useState } from "react";
import type { CSSProperties } from "react";
import type { TemplateField } from "@/db/schema";
import { DocumentPreviewPane } from "@/components/document-preview-pane";
import { useResizablePaneWidth, ResizeHandle } from "@/hooks/use-resizable-pane-width";
import { inputClasses } from "@/components/ui/input";
import { buttonClasses } from "@/components/ui/button";
import { downloadBlob } from "@/lib/download";
import { slugifyFilename } from "@/lib/slugify";
import { orpc, orpcErrorMessage } from "@/lib/orpc";
import { blankValues } from "./field-grouping";
import { usePersistedValues } from "./use-persisted-values";
import { useLivePreview } from "./use-live-preview";
import { ValuesToolbar } from "./values-toolbar";
import { FieldGroups } from "./field-groups";

type FillFormProps = { templateId: string; fields: TemplateField[]; templateName: string };
type OutputFormat = "pdf" | "docx";

export function SingleFillForm({ templateId, fields, templateName }: FillFormProps) {
  const { values, setValues, persist } = usePersistedValues(templateId, fields);
  const { previewUrl, isPreviewLoading, previewError } = useLivePreview(templateId, values);

  const [format, setFormat] = useState<OutputFormat>("pdf");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { width: formWidth, containerRef, startResizing, resetWidth } = useResizablePaneWidth();

  function updateValues(next: Record<string, string>) {
    setValues(next);
    persist(next);
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      const file = await orpc.templates.generate({ id: templateId, data: values, format });
      downloadBlob(file, `${slugifyFilename(templateName)}.${format}`);
    } catch (err) {
      setError(orpcErrorMessage(err, "Failed to generate document"));
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleExportValues() {
    const data = Object.fromEntries(fields.map((f) => [f.key, values[f.key] ?? ""]));
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    downloadBlob(blob, `${slugifyFilename(templateName)}.values.json`);
  }

  async function handleImportValues(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        throw new Error("Invalid file");
      }
      const fieldKeys = new Set(fields.map((f) => f.key));
      const imported: Record<string, string> = {};
      for (const [key, value] of Object.entries(parsed)) {
        if (fieldKeys.has(key) && typeof value === "string") imported[key] = value;
      }
      updateValues({ ...values, ...imported });
      setError(null);
    } catch {
      setError("Failed to import values: not a valid values file");
    }
  }

  function handleClearValues() {
    updateValues(blankValues(fields));
    setError(null);
  }

  return (
    <div ref={containerRef} className="flex h-full min-h-0 flex-col lg:flex-row">
      <form
        onSubmit={handleSubmit}
        style={{ "--form-width": `${formWidth}px` } as CSSProperties}
        aria-describedby={error ? "form-error" : undefined}
        className="flex flex-col gap-4 p-6 overflow-y-auto lg:w-[var(--form-width)] lg:shrink-0 border-b lg:border-b-0 border-border"
      >
        <ValuesToolbar
          onExport={handleExportValues}
          onImport={handleImportValues}
          onClear={handleClearValues}
        />

        <FieldGroups
          fields={fields}
          values={values}
          onFieldChange={(key, value) => updateValues({ ...values, [key]: value })}
        />

        {error && (
          <p id="form-error" role="alert" className="text-sm text-red-600 dark:text-red-400">
            {error}
          </p>
        )}

        <div className="flex items-center gap-2">
          <button type="submit" disabled={isSubmitting} className={buttonClasses()}>
            {isSubmitting ? "Generating…" : `Download ${format.toUpperCase()}`}
          </button>
          <select
            aria-label="Download format"
            value={format}
            onChange={(e) => setFormat(e.target.value as OutputFormat)}
            className={inputClasses}
          >
            <option value="pdf">PDF</option>
            <option value="docx">Word (.docx)</option>
          </select>
        </div>
      </form>

      <ResizeHandle onPointerDown={startResizing} onReset={resetWidth} />

      <DocumentPreviewPane
        url={previewUrl}
        loading={isPreviewLoading}
        error={previewError}
        loadingLabel="Updating preview…"
        emptyState={
          <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
            {isPreviewLoading ? "Rendering preview…" : "Preview will appear here"}
          </div>
        }
      />
    </div>
  );
}
