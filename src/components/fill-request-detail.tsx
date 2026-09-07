import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { fillRequests, templates, type TemplateField } from "@/db/schema";
import { requestedFields } from "@/lib/fill-request-fields";

export type FillRequestStatus =
  | { status: "not_found" }
  | { status: "used" }
  | {
      status: "ok";
      templateName: string;
      fields: TemplateField[];
      /** The owner's own heading for this link, if they wrote one. */
      title: string | null;
      /** A free-text note from the owner, shown above the fields. */
      message: string | null;
    };

/**
 * Fetches a fill link by its code for the public `/fill/[code]` page.
 * Distinguishes a code that never existed from one that's already been
 * filled in or revoked, so the page can show the right message — but never
 * exposes the template's document itself: only the fields this particular
 * link asks for, and the owner's title and note.
 */
export async function getFillRequestStatus(code: string): Promise<FillRequestStatus> {
  const db = getDb();
  const [row] = await db
    .select({ fillRequest: fillRequests, template: templates })
    .from(fillRequests)
    .innerJoin(templates, eq(fillRequests.templateId, templates.id))
    .where(eq(fillRequests.code, code));

  if (!row) return { status: "not_found" };
  if (row.fillRequest.filledAt || row.fillRequest.revokedAt) return { status: "used" };
  return {
    status: "ok",
    templateName: row.template.name,
    fields: requestedFields(row.template.fields, row.fillRequest.fieldKeys),
    title: row.fillRequest.title,
    message: row.fillRequest.message,
  };
}
