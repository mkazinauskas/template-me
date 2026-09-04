import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { and, desc, eq, isNull } from "drizzle-orm";
import { nanoid } from "nanoid";
import { getDb } from "@/db";
import { fillRequests, templates, type FillRequest } from "@/db/schema";
import { isTemplateOwner } from "@/lib/template-access";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";
import { toFieldStrings, validateRow } from "@/server/generate/row-validation";
import { protectedProcedure, publicProcedure } from "@/server/orpc/base";
import { loadOwnedTemplate } from "@/server/orpc/routers/templates";

const CODE_LENGTH = 14;
const MAX_CODE_ATTEMPTS = 5;

const LINK_UNAVAILABLE = "This link is invalid or has already been used";

const rowData = z.record(z.string(), z.unknown());

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: unknown }).code === "23505"
  );
}

/**
 * Inserts a fresh fill request row for a template, generating a random code.
 * Collisions are astronomically unlikely (14 nanoid characters) but retried a
 * few times rather than trusted away, since the code doubles as the link's
 * only access control.
 */
async function insertFillRequest(templateId: string): Promise<FillRequest> {
  const db = getDb();
  for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt++) {
    try {
      const [row] = await db
        .insert(fillRequests)
        .values({ templateId, code: nanoid(CODE_LENGTH) })
        .returning();
      return row;
    } catch (err) {
      if (!isUniqueViolation(err) || attempt === MAX_CODE_ATTEMPTS - 1) throw err;
    }
  }
  throw new Error("unreachable");
}

/** Fetches a still-usable (not filled, not revoked) fill request by its code, with its template. */
async function loadActiveFillRequest(code: string) {
  const db = getDb();
  const [row] = await db
    .select({ fillRequest: fillRequests, template: templates })
    .from(fillRequests)
    .innerJoin(templates, eq(fillRequests.templateId, templates.id))
    .where(eq(fillRequests.code, code));
  if (!row || row.fillRequest.filledAt || row.fillRequest.revokedAt) {
    throw new ORPCError("NOT_FOUND", { message: LINK_UNAVAILABLE });
  }
  return row;
}

/** Fetches a fill request by id with its template, requiring the caller to own that template. */
async function loadOwnedFillRequest(id: string, userId: string) {
  const db = getDb();
  const [row] = await db
    .select({ fillRequest: fillRequests, template: templates })
    .from(fillRequests)
    .innerJoin(templates, eq(fillRequests.templateId, templates.id))
    .where(eq(fillRequests.id, id));
  if (!row || !isTemplateOwner(row.template, userId)) {
    throw new ORPCError("NOT_FOUND", { message: "Fill link not found" });
  }
  return row;
}

/**
 * The public endpoints (`getByCode`, `submit`) take no session and are keyed
 * only by an unguessable code, so they're throttled per IP to slow down
 * anyone trying to brute-force or hammer a code.
 */
async function enforcePublicLinkRateLimit(headers: Headers): Promise<void> {
  const { allowed, retryAfterSeconds } = await checkRateLimit(
    `fill-request:${clientIp(headers)}`,
    { windowMs: 60_000, max: 20 }
  );
  if (!allowed) {
    throw new ORPCError("TOO_MANY_REQUESTS", {
      message: "Too many requests. Please wait a moment and try again.",
      data: { retryAfterSeconds },
    });
  }
}

export const fillRequestsRouter = {
  /** Owner-only: creates a new one-time fill link for a template. */
  create: protectedProcedure
    .input(z.object({ templateId: z.string() }))
    .handler(async ({ input, context }) => {
      await loadOwnedTemplate(input.templateId, context.session.user.id);
      const fillRequest = await insertFillRequest(input.templateId);
      return { fillRequest };
    }),

  /** Owner-only: every fill link created for a template, newest first. */
  list: protectedProcedure
    .input(z.object({ templateId: z.string() }))
    .handler(async ({ input, context }) => {
      await loadOwnedTemplate(input.templateId, context.session.user.id);
      const db = getDb();
      const rows = await db
        .select()
        .from(fillRequests)
        .where(eq(fillRequests.templateId, input.templateId))
        .orderBy(desc(fillRequests.createdAt));
      return { fillRequests: rows };
    }),

  /** Owner-only: cancels a link that hasn't been filled in yet. A no-op if it's already filled or revoked. */
  revoke: protectedProcedure
    .input(z.object({ id: z.string() }))
    .handler(async ({ input, context }) => {
      const { fillRequest } = await loadOwnedFillRequest(input.id, context.session.user.id);
      const db = getDb();
      const [updated] = await db
        .update(fillRequests)
        .set({ revokedAt: new Date() })
        .where(
          and(
            eq(fillRequests.id, input.id),
            isNull(fillRequests.filledAt),
            isNull(fillRequests.revokedAt)
          )
        )
        .returning();
      return { fillRequest: updated ?? fillRequest };
    }),

  /** Owner-only: corrects the data on a link that's already been filled in. */
  updateData: protectedProcedure
    .input(z.object({ id: z.string(), data: rowData }))
    .handler(async ({ input, context }) => {
      const { fillRequest, template } = await loadOwnedFillRequest(
        input.id,
        context.session.user.id
      );
      if (!fillRequest.filledAt) {
        throw new ORPCError("BAD_REQUEST", { message: "This link hasn't been filled in yet" });
      }

      const validationError = validateRow(template, input.data, false);
      if (validationError) {
        throw new ORPCError("BAD_REQUEST", { message: validationError });
      }

      const db = getDb();
      const [updated] = await db
        .update(fillRequests)
        .set({ data: toFieldStrings(template, input.data) })
        .where(eq(fillRequests.id, input.id))
        .returning();
      return { fillRequest: updated };
    }),

  /** Owner-only: permanently deletes a fill request (and its submitted data, if any). */
  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .handler(async ({ input, context }) => {
      await loadOwnedFillRequest(input.id, context.session.user.id);
      const db = getDb();
      await db.delete(fillRequests).where(eq(fillRequests.id, input.id));
      return { ok: true as const };
    }),

  /** Public: the template's name and fields for a still-usable link — never the document itself. */
  getByCode: publicProcedure
    .input(z.object({ code: z.string() }))
    .handler(async ({ input, context }) => {
      await enforcePublicLinkRateLimit(context.headers);
      const { template } = await loadActiveFillRequest(input.code);
      return { templateName: template.name, fields: template.fields };
    }),

  /**
   * Public: submits the one-time filled data for a link. The update's WHERE
   * clause only matches a row that's still open, so two concurrent submits
   * for the same code can't both succeed — the loser gets NOT_FOUND.
   */
  submit: publicProcedure
    .input(z.object({ code: z.string(), data: rowData }))
    .handler(async ({ input, context }) => {
      await enforcePublicLinkRateLimit(context.headers);
      const { template } = await loadActiveFillRequest(input.code);

      const validationError = validateRow(template, input.data, false);
      if (validationError) {
        throw new ORPCError("BAD_REQUEST", { message: validationError });
      }

      const db = getDb();
      const [updated] = await db
        .update(fillRequests)
        .set({ data: toFieldStrings(template, input.data), filledAt: new Date() })
        .where(
          and(
            eq(fillRequests.code, input.code),
            isNull(fillRequests.filledAt),
            isNull(fillRequests.revokedAt)
          )
        )
        .returning();
      if (!updated) {
        throw new ORPCError("NOT_FOUND", { message: LINK_UNAVAILABLE });
      }
      return { ok: true as const };
    }),
};
