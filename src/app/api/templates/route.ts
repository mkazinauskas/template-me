import { NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { getDb } from "@/db";
import { templates } from "@/db/schema";
import { extractFields } from "@/lib/docx-template";
import { desc } from "drizzle-orm";

export async function GET() {
  const db = getDb();
  const rows = await db.select().from(templates).orderBy(desc(templates.createdAt));
  return NextResponse.json({ templates: rows });
}

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get("file");
  const name = formData.get("name");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing file" }, { status: 400 });
  }
  if (!file.name.toLowerCase().endsWith(".docx")) {
    return NextResponse.json({ error: "File must be a .docx document" }, { status: 400 });
  }

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

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

  const blob = await put(`templates/${crypto.randomUUID()}-${file.name}`, buffer, {
    access: "private",
    contentType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });

  const db = getDb();
  const [row] = await db
    .insert(templates)
    .values({
      name: typeof name === "string" && name.trim() ? name.trim() : file.name.replace(/\.docx$/i, ""),
      originalFilename: file.name,
      blobUrl: blob.url,
      blobPathname: blob.pathname,
      fields,
    })
    .returning();

  return NextResponse.json({ template: row, warnings }, { status: 201 });
}
