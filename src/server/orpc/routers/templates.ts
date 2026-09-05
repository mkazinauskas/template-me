import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { templates, type Template, type TemplateField } from "@/db/schema";
import { auth } from "@/lib/auth";
import { extractFields } from "@/lib/docx-template";
import { convertDocxToPdf } from "@/lib/docx-to-pdf";
import { deleteFile, getFile, putFile, statFile, type StoredFile } from "@/lib/storage";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";
import {
  canViewTemplate,
  isTemplateOwner,
  publicTemplateView,
} from "@/lib/template-access";
import {
  DOCX_CONTENT_TYPE,
  MAX_TEMPLATE_UPLOAD_BYTES as MAX_UPLOAD_BYTES,
} from "@/lib/upload-limits";
import { handleBulk } from "@/server/generate/bulk";
import { sanitizeFilename } from "@/server/generate/filename";
import { startPdfSandbox } from "@/server/generate/pdf-sandbox";
import { renderRow, validateRow } from "@/server/generate/row-validation";
import { protectedProcedure, publicProcedure } from "@/server/orpc/base";

type Session = Awaited<ReturnType<typeof auth.api.getSession>>;

// This procedure boots a Vercel Sandbox + LibreOffice per call (and a bulk call
// can render/convert up to 100 documents), so it's throttled well below what a
// legitimate workflow needs, to bound cost/abuse. Signed-in callers are keyed by
// user id; anonymous callers (allowed for public templates) are keyed by client
// IP, at a tighter cap since we can't attribute the load to an account.
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_USER = 10;
const RATE_LIMIT_MAX_ANON = 4;

// generateBulk allows up to MAX_BULK_ROWS (100) documents per call, which
// combined with RATE_LIMIT_MAX_ANON would let an anonymous visitor to any
// *public* template trigger 400 LibreOffice conversions/minute. Anonymous
// callers can't be attributed to an account, so their bulk requests are
// capped far lower regardless of the per-call rate limit above.
const MAX_BULK_ROWS_ANON = 20;

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

/** Validates a candidate .docx buffer and extracts its templated fields. */
function validateDocxBuffer(
  buffer: Buffer
):
  | { ok: true; fields: TemplateField[]; warnings: string[] }
  | { ok: false; error: string } {
  if (!hasZipMagicBytes(buffer)) {
    return { ok: false, error: "Could not read this file as a Word document" };
  }
  try {
    const { fields, warnings } = extractFields(buffer);
    if (fields.length === 0) {
      return {
        ok: false,
        error:
          "No templated fields found. Add placeholders like {{field_name}} to the document.",
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
      name: params.name.trim()
        ? params.name.trim()
        : params.originalFilename.replace(/\.docx$/i, ""),
      originalFilename: params.originalFilename,
      blobUrl: params.stored.url,
      blobPathname: params.stored.pathname,
      fields: params.fields,
      userId: params.userId,
    })
    .returning();
  return row;
}

/** Fetches a template by id, enforcing the shared view rule (owner, or public). */
async function loadViewableTemplate(id: string, session: Session): Promise<Template> {
  const db = getDb();
  const [row] = await db.select().from(templates).where(eq(templates.id, id));
  if (!row || !canViewTemplate(row, session?.user.id)) {
    throw new ORPCError("NOT_FOUND", { message: "Template not found" });
  }
  return row;
}

/** Fetches a template by id, requiring the caller to be its owner. */
export async function loadOwnedTemplate(id: string, userId: string): Promise<Template> {
  const db = getDb();
  const [row] = await db.select().from(templates).where(eq(templates.id, id));
  if (!row || !isTemplateOwner(row, userId)) {
    throw new ORPCError("NOT_FOUND", { message: "Template not found" });
  }
  return row;
}

function docxTooLargeError(): ORPCError<"BAD_REQUEST", undefined> {
  return new ORPCError("BAD_REQUEST", {
    message: `File is too large. Max size is ${MAX_UPLOAD_BYTES / (1024 * 1024)} MB.`,
  });
}

/** Shape of one field's value coming from a fill-in form (always stringly typed on the wire). */
const rowData = z.record(z.string(), z.unknown());

const createInput = z.union([
  // LOCAL_MODE (Docker Compose, no Vercel Blob token): the browser posts the
  // .docx straight through as multipart form-data.
  z.object({
    file: z.instanceof(File),
    name: z.string().optional(),
  }),
  // Everywhere else: the browser uploaded the bytes to Blob directly and now
  // finalizes by referencing the already-stored object.
  z.object({
    blobUrl: z.string().min(1),
    blobPathname: z.string().min(1),
    originalFilename: z.string().min(1),
    name: z.string().optional(),
  }),
]);

async function createFromFile(
  input: { file: File; name?: string },
  userId: string
): Promise<{ template: Template; warnings: string[] }> {
  const { file, name = "" } = input;
  if (!file.name.toLowerCase().endsWith(".docx")) {
    throw new ORPCError("BAD_REQUEST", { message: "File must be a .docx document" });
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    throw docxTooLargeError();
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const validated = validateDocxBuffer(buffer);
  if (!validated.ok) {
    throw new ORPCError("BAD_REQUEST", { message: validated.error });
  }

  // `file.name` is fully client-controlled (a `File` built in JS isn't limited
  // to a bare filename the way a file picker is), and in LOCAL_MODE this
  // pathname is joined onto a real directory — so it has to be flattened to a
  // single safe segment before it can become a path. The `templates/{userId}/`
  // prefix also keeps this branch on the same per-user layout `createFromBlob`
  // enforces, rather than a second, unscoped one.
  const stored = await putFile(
    `templates/${userId}/${crypto.randomUUID()}-${sanitizeFilename(file.name)}`,
    buffer,
    DOCX_CONTENT_TYPE
  );
  const row = await insertTemplateRow({
    name,
    originalFilename: file.name,
    stored,
    fields: validated.fields,
    userId,
  });
  return { template: row, warnings: validated.warnings };
}

async function createFromBlob(
  input: { blobUrl: string; blobPathname: string; originalFilename: string; name?: string },
  userId: string
): Promise<{ template: Template; warnings: string[] }> {
  const { blobUrl, blobPathname, originalFilename, name = "" } = input;

  if (!blobPathname.startsWith(`templates/${userId}/`)) {
    throw new ORPCError("BAD_REQUEST", { message: "Invalid upload" });
  }
  if (!originalFilename.toLowerCase().endsWith(".docx")) {
    throw new ORPCError("BAD_REQUEST", { message: "File must be a .docx document" });
  }

  // The client supplies both the url to read and the pathname it claims that
  // url has, and only the pathname is checked against the caller's own prefix
  // above — nothing ties the two together. Ask storage what actually lives at
  // the url so a caller who learned someone else's blob url can't pair it with
  // a self-consistent pathname and adopt that content as their own template.
  const stored = await statFile(blobUrl);
  if (!stored) {
    throw new ORPCError("BAD_REQUEST", { message: "Uploaded file not found" });
  }
  if (stored.pathname !== blobPathname) {
    // Deliberately no `deleteFile` here: the object isn't confirmed to be this
    // caller's, and deleting it would turn a mismatch into a way to destroy
    // another user's upload.
    throw new ORPCError("BAD_REQUEST", { message: "Invalid upload" });
  }
  if (stored.size > MAX_UPLOAD_BYTES) {
    await deleteFile(blobUrl);
    throw docxTooLargeError();
  }

  const buffer = await getFile(blobUrl);
  if (!buffer) {
    throw new ORPCError("BAD_REQUEST", { message: "Uploaded file not found" });
  }

  const validated = validateDocxBuffer(buffer);
  if (!validated.ok) {
    await deleteFile(blobUrl);
    throw new ORPCError("BAD_REQUEST", { message: validated.error });
  }

  const row = await insertTemplateRow({
    name,
    originalFilename,
    stored: { url: blobUrl, pathname: blobPathname },
    fields: validated.fields,
    userId,
  });
  return { template: row, warnings: validated.warnings };
}

async function enforceGenerateRateLimit(session: Session, headers: Headers): Promise<void> {
  const key = session
    ? `generate:${session.user.id}`
    : `generate:anon:${clientIp(headers)}`;
  const { allowed, retryAfterSeconds } = await checkRateLimit(key, {
    windowMs: RATE_LIMIT_WINDOW_MS,
    max: session ? RATE_LIMIT_MAX_USER : RATE_LIMIT_MAX_ANON,
  });
  if (!allowed) {
    throw new ORPCError("TOO_MANY_REQUESTS", {
      message:
        "Too many document generation requests. Please wait a moment and try again.",
      data: { retryAfterSeconds },
    });
  }
}

export const templatesRouter = {
  /** The signed-in user's own templates, newest first. */
  list: protectedProcedure.handler(async ({ context }) => {
    const db = getDb();
    const rows = await db
      .select()
      .from(templates)
      .where(eq(templates.userId, context.session.user.id))
      .orderBy(desc(templates.createdAt));
    return { templates: rows };
  }),

  /** One template — the full row for its owner, the redacted view for a public viewer. */
  get: publicProcedure
    .input(z.object({ id: z.string() }))
    .handler(async ({ input, context }) => {
      const db = getDb();
      const [row] = await db.select().from(templates).where(eq(templates.id, input.id));
      if (!row || !canViewTemplate(row, context.session?.user.id)) {
        throw new ORPCError("NOT_FOUND", { message: "Template not found" });
      }
      const template = isTemplateOwner(row, context.session?.user.id)
        ? row
        : publicTemplateView(row);
      return { template };
    }),

  /**
   * Registers an uploaded template. Accepts either a multipart `file`
   * (LOCAL_MODE) or a reference to bytes already uploaded to Blob.
   */
  create: protectedProcedure
    .input(createInput)
    .handler(async ({ input, context }) => {
      // Which of the two upload paths is valid is a property of the deployment,
      // not of the request: LOCAL_MODE has no Blob store to have uploaded to,
      // and a cloud deployment has no writable filesystem to accept multipart
      // bytes into. Dispatching on the server's own mode rather than on
      // whichever shape the client happened to send stops a caller from
      // selecting the other deployment's code path.
      const localMode = process.env.LOCAL_MODE === "true";
      if (localMode !== ("file" in input)) {
        throw new ORPCError("BAD_REQUEST", { message: "Invalid upload" });
      }
      return "file" in input
        ? createFromFile(input, context.session.user.id)
        : createFromBlob(input, context.session.user.id);
    }),

  /** Owner-only: flip a template between private and public. */
  setPublic: protectedProcedure
    .input(z.object({ id: z.string(), isPublic: z.boolean() }))
    .handler(async ({ input, context }) => {
      await loadOwnedTemplate(input.id, context.session.user.id);
      const db = getDb();
      const [updated] = await db
        .update(templates)
        .set({ isPublic: input.isPublic })
        .where(eq(templates.id, input.id))
        .returning();
      return { template: updated };
    }),

  /** Owner-only: delete a template and its stored file. */
  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .handler(async ({ input, context }) => {
      const row = await loadOwnedTemplate(input.id, context.session.user.id);
      const db = getDb();
      await deleteFile(row.blobUrl).catch(() => {});
      await db.delete(templates).where(eq(templates.id, input.id));
      return { ok: true as const };
    }),

  /** Serves the raw, unfilled template `.docx` to anyone who may view it. */
  download: publicProcedure
    .input(z.object({ id: z.string() }))
    .handler(async ({ input, context }) => {
      const row = await loadViewableTemplate(input.id, context.session);
      const file = await getFile(row.blobUrl);
      if (!file) {
        throw new ORPCError("INTERNAL_SERVER_ERROR", {
          message: "Template file is missing from storage",
        });
      }
      return new File([new Uint8Array(file)], `${sanitizeFilename(row.name)}.docx`, {
        type: DOCX_CONTENT_TYPE,
      });
    }),

  /**
   * Fills a template with one row of data and returns the result as a
   * downloadable file. `preview` renders a PDF regardless of `format` and
   * skips the required-field check.
   */
  generate: publicProcedure
    .input(
      z.object({
        id: z.string(),
        data: rowData,
        preview: z.boolean().optional(),
        format: z.enum(["pdf", "docx"]).optional(),
      })
    )
    .handler(async ({ input, context }) => {
      await enforceGenerateRateLimit(context.session, context.headers);
      const templateRow = await loadViewableTemplate(input.id, context.session);

      const preview = input.preview === true;
      const format = input.format === "docx" ? "docx" : "pdf";

      const validationError = validateRow(templateRow, input.data, preview);
      if (validationError) {
        throw new ORPCError("BAD_REQUEST", { message: validationError });
      }

      // Preview is always rendered as PDF for the inline iframe, regardless of
      // the requested download format.
      const needsPdf = preview || format === "pdf";
      const { sandboxPromise, stopIfUnused } = startPdfSandbox(needsPdf);

      const originalDocx = await getFile(templateRow.blobUrl);
      if (!originalDocx) {
        stopIfUnused();
        throw new ORPCError("INTERNAL_SERVER_ERROR", {
          message: "Template file is missing from storage",
        });
      }

      let renderedDocx: Buffer;
      try {
        renderedDocx = renderRow(templateRow, originalDocx, input.data);
      } catch {
        stopIfUnused();
        throw new ORPCError("INTERNAL_SERVER_ERROR", {
          message: "Failed to fill in the document",
        });
      }

      const baseName = sanitizeFilename(templateRow.name);

      if (!needsPdf) {
        return new File([new Uint8Array(renderedDocx)], `${baseName}.docx`, {
          type: DOCX_CONTENT_TYPE,
        });
      }

      let pdfBuffer: Buffer;
      try {
        pdfBuffer = await convertDocxToPdf(renderedDocx, sandboxPromise!);
      } catch (err) {
        console.error("PDF conversion failed", err);
        throw new ORPCError("INTERNAL_SERVER_ERROR", {
          message: "Failed to convert document to PDF",
        });
      }

      return new File([new Uint8Array(pdfBuffer)], `${baseName}.pdf`, {
        type: "application/pdf",
      });
    }),

  /**
   * Fills a template once per row and returns a zip of the results. Always a
   * full (non-preview) render; every row must pass validation.
   */
  generateBulk: publicProcedure
    .input(
      z.object({
        id: z.string(),
        rows: z.array(z.object({ data: rowData, filename: z.string().optional() })),
        format: z.enum(["pdf", "docx"]).optional(),
      })
    )
    .handler(async ({ input, context }) => {
      await enforceGenerateRateLimit(context.session, context.headers);
      if (!context.session && input.rows.length > MAX_BULK_ROWS_ANON) {
        throw new ORPCError("BAD_REQUEST", {
          message: `Too many rows for an anonymous request (${input.rows.length}). Sign in, or split into batches of ${MAX_BULK_ROWS_ANON} or fewer.`,
        });
      }
      const templateRow = await loadViewableTemplate(input.id, context.session);
      const format = input.format === "docx" ? "docx" : "pdf";

      const zipBuffer = await handleBulk(templateRow, input.rows, format);
      return new File(
        [new Uint8Array(zipBuffer)],
        `${sanitizeFilename(templateRow.name)}.zip`,
        { type: "application/zip" }
      );
    }),
};
