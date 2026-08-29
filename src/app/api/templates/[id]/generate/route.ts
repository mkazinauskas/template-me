import { NextRequest, NextResponse, after } from "next/server";
import { eq } from "drizzle-orm";
import { get } from "@vercel/blob";
import PizZip from "pizzip";
import { getDb } from "@/db";
import { templates, type Template } from "@/db/schema";
import { renderDocx } from "@/lib/docx-template";
import { convertDocxToPdf, convertDocxBuffersToPdf, createPdfSandbox } from "@/lib/docx-to-pdf";

export const maxDuration = 300;

const MAX_BULK_ROWS = 100;

/** Validates one row's data against the template's fields. Returns an error message, or null if valid. */
function validateRow(templateRow: Template, data: Record<string, unknown>, preview: boolean): string | null {
  if (!preview) {
    const missing = templateRow.fields
      .filter((f) => f.type !== "boolean")
      .map((f) => f.key)
      .filter((key) => !(key in data) || String(data[key]).trim() === "");
    if (missing.length > 0) {
      return `Missing values for: ${missing.join(", ")}`;
    }
  }

  const invalid: string[] = [];
  for (const field of templateRow.fields) {
    const value = String(data[field.key] ?? "");
    if (preview && value === "") continue;
    if (field.type === "number" && value !== "" && Number.isNaN(Number(value))) {
      invalid.push(field.key);
    }
    if (field.type === "select" && field.params.length > 0 && !field.params.includes(value)) {
      invalid.push(field.key);
    }
  }
  if (invalid.length > 0) {
    return `Invalid value for: ${invalid.join(", ")}`;
  }
  return null;
}

function renderRow(templateRow: Template, originalDocx: Buffer, data: Record<string, unknown>): Buffer {
  const stringData: Record<string, string> = {};
  for (const field of templateRow.fields) {
    stringData[field.key] = String(data[field.key] ?? "");
  }
  return renderDocx(originalDocx, templateRow.fields, stringData);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = getDb();
  const [templateRow] = await db.select().from(templates).where(eq(templates.id, id));
  if (!templateRow) {
    return NextResponse.json({ error: "Template not found" }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  const preview = body?.preview === true;
  const rows = body?.rows;

  if (Array.isArray(rows)) {
    return handleBulk(templateRow, rows);
  }

  const data = body?.data;
  if (!data || typeof data !== "object") {
    return NextResponse.json({ error: "Missing field data" }, { status: 400 });
  }

  const validationError = validateRow(templateRow, data, preview);
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  // Boot the sandbox VM now, in parallel with the blob fetch + render below,
  // instead of only starting it once convertDocxToPdf is called.
  const sandboxPromise = createPdfSandbox();
  sandboxPromise.catch(() => {});
  const stopUnusedSandbox = () => after(() => sandboxPromise.then((s) => s.stop()).catch(() => {}));

  const blobFile = await get(templateRow.blobUrl, { access: "private" });
  if (!blobFile || blobFile.statusCode !== 200) {
    stopUnusedSandbox();
    return NextResponse.json({ error: "Template file is missing from storage" }, { status: 500 });
  }
  const originalDocx = Buffer.from(await new Response(blobFile.stream).arrayBuffer());

  let renderedDocx: Buffer;
  try {
    renderedDocx = renderRow(templateRow, originalDocx, data);
  } catch {
    stopUnusedSandbox();
    return NextResponse.json({ error: "Failed to fill in the document" }, { status: 500 });
  }

  let pdfBuffer: Buffer;
  try {
    pdfBuffer = await convertDocxToPdf(renderedDocx, sandboxPromise);
  } catch (err) {
    console.error("PDF conversion failed", err);
    return NextResponse.json({ error: "Failed to convert document to PDF" }, { status: 500 });
  }

  const filename = `${templateRow.name.replace(/[^a-zA-Z0-9-_]+/g, "_")}.pdf`;
  const disposition = preview ? "inline" : `attachment; filename="${filename}"`;
  return new NextResponse(new Uint8Array(pdfBuffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": disposition,
    },
  });
}

async function handleBulk(templateRow: Template, rows: unknown[]) {
  if (rows.length === 0) {
    return NextResponse.json({ error: "No rows provided" }, { status: 400 });
  }
  if (rows.length > MAX_BULK_ROWS) {
    return NextResponse.json(
      { error: `Too many rows (${rows.length}). Split into batches of ${MAX_BULK_ROWS} or fewer.` },
      { status: 400 }
    );
  }

  const entries: { data: Record<string, unknown>; filename: string }[] = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const data = (row as { data?: unknown } | null)?.data;
    if (!data || typeof data !== "object") {
      return NextResponse.json({ error: `Row ${i + 1}: missing field data` }, { status: 400 });
    }
    const validationError = validateRow(templateRow, data as Record<string, unknown>, false);
    if (validationError) {
      return NextResponse.json({ error: `Row ${i + 1}: ${validationError}` }, { status: 400 });
    }
    const rawFilename = (row as { filename?: unknown }).filename;
    const base =
      typeof rawFilename === "string" && rawFilename.trim() !== ""
        ? rawFilename.trim()
        : `${templateRow.name}-${i + 1}`;
    entries.push({ data: data as Record<string, unknown>, filename: base.replace(/[^a-zA-Z0-9-_]+/g, "_") });
  }

  const sandboxPromise = createPdfSandbox();
  sandboxPromise.catch(() => {});
  const stopUnusedSandbox = () => after(() => sandboxPromise.then((s) => s.stop()).catch(() => {}));

  const blobFile = await get(templateRow.blobUrl, { access: "private" });
  if (!blobFile || blobFile.statusCode !== 200) {
    stopUnusedSandbox();
    return NextResponse.json({ error: "Template file is missing from storage" }, { status: 500 });
  }
  const originalDocx = Buffer.from(await new Response(blobFile.stream).arrayBuffer());

  let renderedDocxBuffers: Buffer[];
  try {
    renderedDocxBuffers = entries.map((entry) => renderRow(templateRow, originalDocx, entry.data));
  } catch {
    stopUnusedSandbox();
    return NextResponse.json({ error: "Failed to fill in the document" }, { status: 500 });
  }

  let pdfBuffers: Buffer[];
  try {
    pdfBuffers = await convertDocxBuffersToPdf(renderedDocxBuffers, sandboxPromise);
  } catch (err) {
    console.error("Bulk PDF conversion failed", err);
    return NextResponse.json({ error: "Failed to convert documents to PDF" }, { status: 500 });
  }

  const zip = new PizZip();
  const usedNames = new Set<string>();
  pdfBuffers.forEach((pdfBuffer, i) => {
    let name = `${entries[i].filename}.pdf`;
    let suffix = 2;
    while (usedNames.has(name)) {
      name = `${entries[i].filename}-${suffix++}.pdf`;
    }
    usedNames.add(name);
    zip.file(name, pdfBuffer);
  });
  const zipBuffer = zip.generate({ type: "nodebuffer" });

  const zipFilename = `${templateRow.name.replace(/[^a-zA-Z0-9-_]+/g, "_")}.zip`;
  return new NextResponse(new Uint8Array(zipBuffer), {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${zipFilename}"`,
    },
  });
}
