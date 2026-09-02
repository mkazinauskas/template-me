import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { deleteFile } from "@/lib/storage";
import { getDb } from "@/db";
import { templates } from "@/db/schema";
import { auth } from "@/lib/auth";
import { canViewTemplate, isTemplateOwner } from "@/lib/template-access";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth.api.getSession({ headers: req.headers });
  const { id } = await params;
  const db = getDb();
  const [row] = await db.select().from(templates).where(eq(templates.id, id));
  if (!row || !canViewTemplate(row, session?.user.id)) {
    return NextResponse.json({ error: "Template not found" }, { status: 404 });
  }
  return NextResponse.json({ template: row });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await req.json().catch(() => null);
  if (typeof body?.isPublic !== "boolean") {
    return NextResponse.json({ error: "Expected { isPublic: boolean }" }, { status: 400 });
  }
  const { id } = await params;
  const db = getDb();
  const [row] = await db.select().from(templates).where(eq(templates.id, id));
  if (!row || !isTemplateOwner(row, session.user.id)) {
    return NextResponse.json({ error: "Template not found" }, { status: 404 });
  }
  const [updated] = await db
    .update(templates)
    .set({ isPublic: body.isPublic })
    .where(eq(templates.id, id))
    .returning();
  return NextResponse.json({ template: updated });
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
  const [row] = await db.select().from(templates).where(eq(templates.id, id));
  if (!row || !isTemplateOwner(row, session.user.id)) {
    return NextResponse.json({ error: "Template not found" }, { status: 404 });
  }
  await deleteFile(row.blobUrl).catch(() => {});
  await db.delete(templates).where(eq(templates.id, id));
  return NextResponse.json({ ok: true });
}
