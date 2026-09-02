import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getFile } from "@/lib/storage";
import { getDb } from "@/db";
import { templates } from "@/db/schema";
import { convertDocxToPdf } from "@/lib/docx-to-pdf";
import { auth } from "@/lib/auth";
import { canViewTemplate } from "@/lib/template-access";
import { checkRateLimit } from "@/lib/rate-limit";
import { handleBulk } from "./bulk";
import { sanitizeFilename } from "./filename";
import { startPdfSandbox } from "./pdf-sandbox";
import { renderRow, validateRow } from "./row-validation";

export const maxDuration = 300;

// This route boots a Vercel Sandbox + LibreOffice per call (and a bulk call can
// render/convert up to 100 documents), so it's throttled well below what a
// legitimate workflow needs, to bound cost/abuse. Signed-in callers are keyed
// by user id; anonymous callers (allowed for public templates) are keyed by
// client IP, at a tighter cap since we can't attribute the load to an account.
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_USER = 10;
const RATE_LIMIT_MAX_ANON = 4;

function clientIp(req: NextRequest): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: req.headers });

  const rateLimitKey = session
    ? `generate:${session.user.id}`
    : `generate:anon:${clientIp(req)}`;
  const { allowed, retryAfterSeconds } = await checkRateLimit(rateLimitKey, {
    windowMs: RATE_LIMIT_WINDOW_MS,
    max: session ? RATE_LIMIT_MAX_USER : RATE_LIMIT_MAX_ANON,
  });
  if (!allowed) {
    return NextResponse.json(
      { error: "Too many document generation requests. Please wait a moment and try again." },
      { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } }
    );
  }

  const { id } = await params;
  const db = getDb();
  const [templateRow] = await db.select().from(templates).where(eq(templates.id, id));
  if (!templateRow || !canViewTemplate(templateRow, session?.user.id)) {
    return NextResponse.json({ error: "Template not found" }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  const preview = body?.preview === true;
  const format = body?.format === "docx" ? "docx" : "pdf";

  if (Array.isArray(body?.rows)) {
    return handleBulk(templateRow, body.rows, format);
  }

  const data = body?.data;
  if (!data || typeof data !== "object") {
    return NextResponse.json({ error: "Missing field data" }, { status: 400 });
  }

  const validationError = validateRow(templateRow, data, preview);
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  // Preview is always rendered as PDF for the inline iframe, regardless of the
  // requested download format.
  const needsPdf = preview || format === "pdf";
  const { sandboxPromise, stopIfUnused } = startPdfSandbox(needsPdf);

  const originalDocx = await getFile(templateRow.blobUrl);
  if (!originalDocx) {
    stopIfUnused();
    return NextResponse.json({ error: "Template file is missing from storage" }, { status: 500 });
  }

  let renderedDocx: Buffer;
  try {
    renderedDocx = renderRow(templateRow, originalDocx, data);
  } catch {
    stopIfUnused();
    return NextResponse.json({ error: "Failed to fill in the document" }, { status: 500 });
  }

  if (!needsPdf) {
    return new NextResponse(new Uint8Array(renderedDocx), {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${sanitizeFilename(templateRow.name)}.docx"`,
      },
    });
  }

  let pdfBuffer: Buffer;
  try {
    pdfBuffer = await convertDocxToPdf(renderedDocx, sandboxPromise!);
  } catch (err) {
    console.error("PDF conversion failed", err);
    return NextResponse.json({ error: "Failed to convert document to PDF" }, { status: 500 });
  }

  const disposition = preview
    ? "inline"
    : `attachment; filename="${sanitizeFilename(templateRow.name)}.pdf"`;
  return new NextResponse(new Uint8Array(pdfBuffer), {
    status: 200,
    headers: { "Content-Type": "application/pdf", "Content-Disposition": disposition },
  });
}
