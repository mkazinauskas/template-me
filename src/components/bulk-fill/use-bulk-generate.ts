import { useState } from "react";
import type { TemplateField } from "@/db/schema";
import { downloadBlob } from "@/lib/download";
import { slugifyFilename } from "@/lib/slugify";
import { orpc, orpcErrorMessage } from "@/lib/orpc";
import {
  buildRowData,
  getRowFileName,
  type BulkSource,
  type OutputFormat,
} from "./row-helpers";

type RowContext = {
  source: BulkSource;
  fields: TemplateField[];
  mapping: Record<string, string>;
  nameField: string;
};

/**
 * Owns the "call the generate endpoint" side of the bulk form: rendering a
 * single-row PDF preview and generating the whole batch as a downloadable zip,
 * along with the loading/error state each produces.
 */
export function useBulkGenerate(templateId: string, templateName: string) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  function swapPreviewUrl(next: string | null) {
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return next;
    });
  }

  function closePreview() {
    swapPreviewUrl(null);
    setPreviewError(null);
  }

  /** Clears everything the preview/submit produced — used when the input source switches. */
  function reset() {
    swapPreviewUrl(null);
    setPreviewError(null);
    setSubmitError(null);
  }

  async function preview(row: Record<string, string> | undefined, ctx: RowContext) {
    if (!row) return;
    setIsPreviewLoading(true);
    setPreviewError(null);
    try {
      const file = await orpc.templates.generate({
        id: templateId,
        data: buildRowData(row, ctx),
        preview: true,
      });
      swapPreviewUrl(URL.createObjectURL(file));
    } catch (err) {
      setPreviewError(orpcErrorMessage(err, "Failed to render preview"));
    } finally {
      setIsPreviewLoading(false);
    }
  }

  async function generateAll(
    rows: Record<string, string>[],
    format: OutputFormat,
    ctx: RowContext
  ) {
    setSubmitError(null);
    setIsSubmitting(true);
    try {
      const payloadRows = rows.map((row) => ({
        data: buildRowData(row, ctx),
        filename: getRowFileName(row, ctx),
      }));
      const file = await orpc.templates.generateBulk({
        id: templateId,
        rows: payloadRows,
        format,
      });
      downloadBlob(file, `${slugifyFilename(templateName)}.zip`);
    } catch (err) {
      setSubmitError(orpcErrorMessage(err, "Failed to generate documents"));
    } finally {
      setIsSubmitting(false);
    }
  }

  return {
    previewUrl,
    isPreviewLoading,
    previewError,
    isSubmitting,
    submitError,
    closePreview,
    reset,
    preview,
    generateAll,
  };
}
