import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { del } from "@vercel/blob";
import { getDb } from "@/db";
import { templates } from "@/db/schema";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = getDb();
  const [row] = await db.select().from(templates).where(eq(templates.id, id));
  if (!row) {
    return NextResponse.json({ error: "Template not found" }, { status: 404 });
  }
  return NextResponse.json({ template: row });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = getDb();
  const [row] = await db.select().from(templates).where(eq(templates.id, id));
  if (!row) {
    return NextResponse.json({ error: "Template not found" }, { status: 404 });
  }
  await del(row.blobUrl).catch(() => {});
  await db.delete(templates).where(eq(templates.id, id));
  return NextResponse.json({ ok: true });
}
