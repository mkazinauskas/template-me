import { NextRequest, NextResponse } from "next/server";
import { putFile } from "@/lib/storage";
import { getDb } from "@/db";
import { templates } from "@/db/schema";
import { extractFields } from "@/lib/docx-template";
import { auth } from "@/lib/auth";
import { desc, eq } from "drizzle-orm";

// Hard cap on the raw upload size — enforced before we ever touch the file's
// bytes (buffer/parse), so an oversized upload is rejected as cheaply as
// possible instead of risking memory pressure just to inspect it.
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB

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

export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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

  if (!hasZipMagicBytes(buffer)) {
    return NextResponse.json(
      { error: "Could not read this file as a Word document" },
      { status: 400 }
    );
  }

  let fields;
  let warnings: string[];
  try {
    ({ fields, warnings } = extractFields(buffer));
  } catch {
    return NextResponse.json(
      { error: "Could not read this file as a Word document" },
      { status: 400 }
    );
  }

  if (fields.length === 0) {
    return NextResponse.json(
      { error: "No templated fields found. Add placeholders like {{field_name}} to the document." },
      { status: 400 }
    );
  }

  const stored = await putFile(
    `templates/${crypto.randomUUID()}-${file.name}`,
    buffer,
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  );

  const db = getDb();
  const [row] = await db
    .insert(templates)
    .values({
      name: typeof name === "string" && name.trim() ? name.trim() : file.name.replace(/\.docx$/i, ""),
      originalFilename: file.name,
      blobUrl: stored.url,
      blobPathname: stored.pathname,
      fields,
      userId: session.user.id,
    })
    .returning();

  return NextResponse.json({ template: row, warnings }, { status: 201 });
}
