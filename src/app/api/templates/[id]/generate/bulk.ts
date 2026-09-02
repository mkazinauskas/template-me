import { NextResponse } from "next/server";
import PizZip from "pizzip";
import { getFile } from "@/lib/storage";
import { convertDocxBuffersToPdf } from "@/lib/docx-to-pdf";
import type { Template } from "@/db/schema";
import { sanitizeFilename } from "./filename";
import { startPdfSandbox } from "./pdf-sandbox";
import { MAX_BULK_ROWS, renderRow, validateRow } from "./row-validation";

type BulkEntry = { data: Record<string, unknown>; filename: string };

/** Parses and validates the incoming rows, or returns the 400 response describing the first problem. */
function parseEntries(
  templateRow: Template,
  rows: unknown[]
): { entries: BulkEntry[] } | { error: NextResponse } {
  const entries: BulkEntry[] = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const data = (row as { data?: unknown } | null)?.data;
    if (!data || typeof data !== "object") {
      return { error: NextResponse.json({ error: `Row ${i + 1}: missing field data` }, { status: 400 }) };
    }
    const validationError = validateRow(templateRow, data as Record<string, unknown>, false);
    if (validationError) {
      return { error: NextResponse.json({ error: `Row ${i + 1}: ${validationError}` }, { status: 400 }) };
    }
    const rawFilename = (row as { filename?: unknown }).filename;
    const base =
      typeof rawFilename === "string" && rawFilename.trim() !== ""
        ? rawFilename.trim()
        : `${templateRow.name}-${i + 1}`;
    entries.push({ data: data as Record<string, unknown>, filename: sanitizeFilename(base) });
  }
  return { entries };
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

/** Handles a bulk generate request: many rows in, one zip of PDFs (or docx files) out. */
export async function handleBulk(
  templateRow: Template,
  rows: unknown[],
  format: "pdf" | "docx"
): Promise<NextResponse> {
  if (rows.length === 0) {
    return NextResponse.json({ error: "No rows provided" }, { status: 400 });
  }
  if (rows.length > MAX_BULK_ROWS) {
    return NextResponse.json(
      { error: `Too many rows (${rows.length}). Split into batches of ${MAX_BULK_ROWS} or fewer.` },
      { status: 400 }
    );
  }

  const parsed = parseEntries(templateRow, rows);
  if ("error" in parsed) return parsed.error;
  const { entries } = parsed;

  const { sandboxPromise, stopIfUnused } = startPdfSandbox(format === "pdf");

  const originalDocx = await getFile(templateRow.blobUrl);
  if (!originalDocx) {
    stopIfUnused();
    return NextResponse.json({ error: "Template file is missing from storage" }, { status: 500 });
  }

  let renderedDocxBuffers: Buffer[];
  try {
    renderedDocxBuffers = entries.map((entry) => renderRow(templateRow, originalDocx, entry.data));
  } catch {
    stopIfUnused();
    return NextResponse.json({ error: "Failed to fill in the document" }, { status: 500 });
  }

  let outputBuffers: Buffer[];
  if (format === "docx") {
    outputBuffers = renderedDocxBuffers;
  } else {
    try {
      outputBuffers = await convertDocxBuffersToPdf(renderedDocxBuffers, sandboxPromise!);
    } catch (err) {
      console.error("Bulk PDF conversion failed", err);
      return NextResponse.json({ error: "Failed to convert documents to PDF" }, { status: 500 });
    }
  }

  const zipBuffer = zipOutputs(entries, outputBuffers, format === "docx" ? "docx" : "pdf");
  return new NextResponse(new Uint8Array(zipBuffer), {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${sanitizeFilename(templateRow.name)}.zip"`,
    },
  });
}
