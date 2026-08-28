import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { get } from "@vercel/blob";
import { getDb } from "@/db";
import { templates } from "@/db/schema";
import { renderDocx } from "@/lib/docx-template";
import { convertDocxToPdf } from "@/lib/docx-to-pdf";

export const maxDuration = 60;

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
  const data = body?.data;
  if (!data || typeof data !== "object") {
    return NextResponse.json({ error: "Missing field data" }, { status: 400 });
  }

  const missing = templateRow.fields
    .map((f) => f.key)
    .filter((key) => !(key in data) || String(data[key]).trim() === "");
  if (missing.length > 0) {
    return NextResponse.json(
      { error: `Missing values for: ${missing.join(", ")}` },
      { status: 400 }
    );
  }

  const blobFile = await get(templateRow.blobUrl, { access: "private" });
  if (!blobFile || blobFile.statusCode !== 200) {
    return NextResponse.json({ error: "Template file is missing from storage" }, { status: 500 });
  }
  const originalDocx = Buffer.from(await new Response(blobFile.stream).arrayBuffer());

  let renderedDocx: Buffer;
  try {
    const stringData: Record<string, string> = {};
    for (const field of templateRow.fields) {
      stringData[field.key] = String(data[field.key] ?? "");
    }
    renderedDocx = renderDocx(originalDocx, stringData);
  } catch {
    return NextResponse.json({ error: "Failed to fill in the document" }, { status: 500 });
  }

  let pdfBuffer: Buffer;
  try {
    pdfBuffer = await convertDocxToPdf(renderedDocx);
  } catch (err) {
    console.error("PDF conversion failed", err);
    return NextResponse.json({ error: "Failed to convert document to PDF" }, { status: 500 });
  }

  const filename = `${templateRow.name.replace(/[^a-zA-Z0-9-_]+/g, "_")}.pdf`;
  return new NextResponse(new Uint8Array(pdfBuffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
