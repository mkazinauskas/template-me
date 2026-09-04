import { ORPCError } from "@orpc/server";
import PizZip from "pizzip";
import { getFile } from "@/lib/storage";
import { convertDocxBuffersToPdf } from "@/lib/docx-to-pdf";
import type { Template } from "@/db/schema";
import { sanitizeFilename } from "./filename";
import { startPdfSandbox } from "./pdf-sandbox";
import { MAX_BULK_ROWS, renderRow, validateRow } from "./row-validation";

export type BulkRow = { data: Record<string, unknown>; filename?: string };

type BulkEntry = { data: Record<string, unknown>; filename: string };

/** Parses and validates the incoming rows, throwing a `BAD_REQUEST` describing the first problem. */
function parseEntries(templateRow: Template, rows: BulkRow[]): BulkEntry[] {
  const entries: BulkEntry[] = [];
  for (let i = 0; i < rows.length; i++) {
    const { data } = rows[i];
    if (!data || typeof data !== "object") {
      throw new ORPCError("BAD_REQUEST", { message: `Row ${i + 1}: missing field data` });
    }
    const validationError = validateRow(templateRow, data, false);
    if (validationError) {
      throw new ORPCError("BAD_REQUEST", { message: `Row ${i + 1}: ${validationError}` });
    }
    const rawFilename = rows[i].filename;
    const base =
      typeof rawFilename === "string" && rawFilename.trim() !== ""
        ? rawFilename.trim()
        : `${templateRow.name}-${i + 1}`;
    entries.push({ data, filename: sanitizeFilename(base) });
  }
  return entries;
}

/** Packs the output buffers into a zip, disambiguating repeated names with `-2`, `-3`, … suffixes. */
function zipOutputs(entries: BulkEntry[], outputs: Buffer[], extension: string): Buffer {
  const zip = new PizZip();
  const usedNames = new Set<string>();
  outputs.forEach((buffer, i) => {
    let name = `${entries[i].filename}.${extension}`;
    let suffix = 2;
    while (usedNames.has(name)) {
      name = `${entries[i].filename}-${suffix++}.${extension}`;
    }
    usedNames.add(name);
    zip.file(name, buffer);
  });
  return zip.generate({ type: "nodebuffer" });
}

/**
 * Handles a bulk generate request: many rows in, one zip of PDFs (or docx
 * files) out. Throws `ORPCError` for every failure mode; returns the raw zip
 * bytes on success (the caller wraps them in a downloadable `File`).
 */
export async function handleBulk(
  templateRow: Template,
  rows: BulkRow[],
  format: "pdf" | "docx"
): Promise<Buffer> {
  if (rows.length === 0) {
    throw new ORPCError("BAD_REQUEST", { message: "No rows provided" });
  }
  if (rows.length > MAX_BULK_ROWS) {
    throw new ORPCError("BAD_REQUEST", {
      message: `Too many rows (${rows.length}). Split into batches of ${MAX_BULK_ROWS} or fewer.`,
    });
  }

  const entries = parseEntries(templateRow, rows);

  const { sandboxPromise, stopIfUnused } = startPdfSandbox(format === "pdf");

  const originalDocx = await getFile(templateRow.blobUrl);
  if (!originalDocx) {
    stopIfUnused();
    throw new ORPCError("INTERNAL_SERVER_ERROR", {
      message: "Template file is missing from storage",
    });
  }

  let renderedDocxBuffers: Buffer[];
  try {
    renderedDocxBuffers = entries.map((entry) => renderRow(templateRow, originalDocx, entry.data));
  } catch {
    stopIfUnused();
    throw new ORPCError("INTERNAL_SERVER_ERROR", { message: "Failed to fill in the document" });
  }

  let outputBuffers: Buffer[];
  if (format === "docx") {
    outputBuffers = renderedDocxBuffers;
  } else {
    try {
      outputBuffers = await convertDocxBuffersToPdf(renderedDocxBuffers, sandboxPromise!);
    } catch (err) {
      console.error("Bulk PDF conversion failed", err);
      throw new ORPCError("INTERNAL_SERVER_ERROR", {
        message: "Failed to convert documents to PDF",
      });
    }
  }

  return zipOutputs(entries, outputBuffers, format === "docx" ? "docx" : "pdf");
}
