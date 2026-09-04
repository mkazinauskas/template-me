import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { fillRequests, templates, type TemplateField } from "@/db/schema";

export type FillRequestStatus =
  | { status: "not_found" }
  | { status: "used" }
  | { status: "ok"; templateName: string; fields: TemplateField[] };

/**
 * Fetches a fill link by its code for the public `/fill/[code]` page.
 * Distinguishes a code that never existed from one that's already been
 * filled in or revoked, so the page can show the right message — but never
 * exposes the template's document itself, only its name and field list.
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
  return { status: "ok", templateName: row.template.name, fields: row.template.fields };
}
