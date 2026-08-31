import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { deleteFile } from "@/lib/storage";
import { getDb } from "@/db";
import { templates } from "@/db/schema";
import { auth } from "@/lib/auth";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const db = getDb();
  const [row] = await db
    .select()
    .from(templates)
    .where(and(eq(templates.id, id), eq(templates.userId, session.user.id)));
  if (!row) {
    return NextResponse.json({ error: "Template not found" }, { status: 404 });
  }
  return NextResponse.json({ template: row });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const db = getDb();
  const [row] = await db
    .select()
    .from(templates)
    .where(and(eq(templates.id, id), eq(templates.userId, session.user.id)));
  if (!row) {
    return NextResponse.json({ error: "Template not found" }, { status: 404 });
  }
  await deleteFile(row.blobUrl).catch(() => {});
  await db
    .delete(templates)
    .where(and(eq(templates.id, id), eq(templates.userId, session.user.id)));
  return NextResponse.json({ ok: true });
}
