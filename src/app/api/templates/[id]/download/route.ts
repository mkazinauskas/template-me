import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getFile } from "@/lib/storage";
import { getDb } from "@/db";
import { templates } from "@/db/schema";
import { auth } from "@/lib/auth";
import { canViewTemplate } from "@/lib/template-access";
import { sanitizeFilename } from "../generate/filename";

const DOCX_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/**
 * Serves the raw, unfilled template `.docx` exactly as it was uploaded. Anyone
 * who can view the template (its owner, or anyone for a public template) can
 * download it — the same access rule as opening the fill-in page. The download
 * is named after the template's display name rather than the stored
 * `originalFilename`, which we don't expose to non-owners.
 */
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

  const file = await getFile(row.blobUrl);
  if (!file) {
    return NextResponse.json(
      { error: "Template file is missing from storage" },
      { status: 500 }
    );
  }

  return new NextResponse(new Uint8Array(file), {
    status: 200,
    headers: {
      "Content-Type": DOCX_CONTENT_TYPE,
      "Content-Disposition": `attachment; filename="${sanitizeFilename(row.name)}.docx"`,
    },
  });
}
