import { NextRequest, NextResponse } from "next/server";
import { deleteFile, getFile, putFile, type StoredFile } from "@/lib/storage";
import { getDb } from "@/db";
import { templates, type TemplateField } from "@/db/schema";
import { extractFields } from "@/lib/docx-template";
import { auth } from "@/lib/auth";
import { desc, eq } from "drizzle-orm";
import { DOCX_CONTENT_TYPE, MAX_TEMPLATE_UPLOAD_BYTES as MAX_UPLOAD_BYTES } from "@/lib/upload-limits";

// The first 4 bytes of every zip (and therefore every .docx, which is a zip
// container) — checked in addition to the ".docx" extension so a
// renamed/spoofed non-zip file is rejected before it ever reaches PizZip.
const ZIP_MAGIC_BYTES = [0x50, 0x4b, 0x03, 0x04];

function hasZipMagicBytes(buffer: Buffer): boolean {
  return (
    buffer.length >= ZIP_MAGIC_BYTES.length &&
    ZIP_MAGIC_BYTES.every((byte, i) => buffer[i] === byte)
  );
}

export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const db = getDb();
  const rows = await db
    .select()
    .from(templates)
    .where(eq(templates.userId, session.user.id))
    .orderBy(desc(templates.createdAt));
  return NextResponse.json({ templates: rows });
}

/** Validates a candidate .docx buffer and extracts its templated fields. */
function validateDocxBuffer(
  buffer: Buffer
): { ok: true; fields: TemplateField[]; warnings: string[] } | { ok: false; error: string } {
  if (!hasZipMagicBytes(buffer)) {
    return { ok: false, error: "Could not read this file as a Word document" };
  }
  try {
    const { fields, warnings } = extractFields(buffer);
    if (fields.length === 0) {
      return {
        ok: false,
        error: "No templated fields found. Add placeholders like {{field_name}} to the document.",
      };
    }
    return { ok: true, fields, warnings };
  } catch {
    return { ok: false, error: "Could not read this file as a Word document" };
  }
}

async function insertTemplateRow(params: {
  name: string;
  originalFilename: string;
  stored: StoredFile;
  fields: TemplateField[];
  userId: string;
}) {
  const db = getDb();
  const [row] = await db
    .insert(templates)
    .values({
      name: params.name.trim() ? params.name.trim() : params.originalFilename.replace(/\.docx$/i, ""),
      originalFilename: params.originalFilename,
      blobUrl: params.stored.url,
      blobPathname: params.stored.pathname,
      fields: params.fields,
      userId: params.userId,
    })
    .returning();
  return row;
}

/**
 * Handles a template whose bytes were already uploaded to Blob directly from
 * the browser (see /api/templates/upload) — used in every environment except
 * LOCAL_MODE, so a large .docx never has to pass through this function's
 * request body and risk a platform-level FUNCTION_PAYLOAD_TOO_LARGE.
 */
async function finalizeBlobUpload(req: NextRequest, userId: string) {
  const body = await req.json().catch(() => null);
  const blobUrl = typeof body?.blobUrl === "string" ? body.blobUrl : null;
  const blobPathname = typeof body?.blobPathname === "string" ? body.blobPathname : null;
  const originalFilename = typeof body?.originalFilename === "string" ? body.originalFilename : null;
  const name = typeof body?.name === "string" ? body.name : "";

  if (!blobUrl || !blobPathname || !originalFilename) {
    return NextResponse.json({ error: "Missing upload details" }, { status: 400 });
  }
  if (!blobPathname.startsWith("templates/")) {
    return NextResponse.json({ error: "Invalid upload" }, { status: 400 });
  }
  if (!originalFilename.toLowerCase().endsWith(".docx")) {
    return NextResponse.json({ error: "File must be a .docx document" }, { status: 400 });
  }

  const buffer = await getFile(blobUrl);
  if (!buffer) {
    return NextResponse.json({ error: "Uploaded file not found" }, { status: 400 });
  }
  if (buffer.length > MAX_UPLOAD_BYTES) {
    await deleteFile(blobUrl);
    return NextResponse.json(
      { error: `File is too large. Max size is ${MAX_UPLOAD_BYTES / (1024 * 1024)} MB.` },
      { status: 400 }
    );
  }

  const validated = validateDocxBuffer(buffer);
  if (!validated.ok) {
    await deleteFile(blobUrl);
    return NextResponse.json({ error: validated.error }, { status: 400 });
  }

  const row = await insertTemplateRow({
    name,
    originalFilename,
    stored: { url: blobUrl, pathname: blobPathname },
    fields: validated.fields,
    userId,
  });

  return NextResponse.json({ template: row, warnings: validated.warnings }, { status: 201 });
}

export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Client-direct-to-Blob uploads finalize with a JSON body referencing the
  // already-stored blob, rather than a multipart body carrying the file.
  if ((req.headers.get("content-type") ?? "").includes("application/json")) {
    return finalizeBlobUpload(req, session.user.id);
  }

  const formData = await req.formData();
  const file = formData.get("file");
  const name = formData.get("name");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing file" }, { status: 400 });
  }
  if (!file.name.toLowerCase().endsWith(".docx")) {
    return NextResponse.json({ error: "File must be a .docx document" }, { status: 400 });
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json(
      { error: `File is too large. Max size is ${MAX_UPLOAD_BYTES / (1024 * 1024)} MB.` },
      { status: 400 }
    );
  }

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  const validated = validateDocxBuffer(buffer);
  if (!validated.ok) {
    return NextResponse.json({ error: validated.error }, { status: 400 });
  }

  const stored = await putFile(`templates/${crypto.randomUUID()}-${file.name}`, buffer, DOCX_CONTENT_TYPE);

  const row = await insertTemplateRow({
    name: typeof name === "string" ? name : "",
    originalFilename: file.name,
    stored,
    fields: validated.fields,
    userId: session.user.id,
  });

  return NextResponse.json({ template: row, warnings: validated.warnings }, { status: 201 });
}
