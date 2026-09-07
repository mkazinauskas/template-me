import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { and, desc, eq, isNull } from "drizzle-orm";
import { nanoid } from "nanoid";
import { getDb } from "@/db";
import { fillRequests, templates, type FillRequest, type Template } from "@/db/schema";
import { isTemplateOwner } from "@/lib/template-access";
import { requestedFields, templateForRequest } from "@/lib/fill-request-fields";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";
import { toFieldStrings, validateRow } from "@/server/generate/row-validation";
import { protectedProcedure, publicProcedure } from "@/server/orpc/base";
import { loadOwnedTemplate } from "@/server/orpc/routers/templates";

const CODE_LENGTH = 14;
const MAX_CODE_ATTEMPTS = 5;

const LINK_UNAVAILABLE = "This link is invalid or has already been used";

const MAX_TITLE_LENGTH = 200;
const MAX_MESSAGE_LENGTH = 2000;

const rowData = z.record(z.string(), z.unknown());

function trimmedOrNull(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/**
 * Narrows the requested field keys to ones the template actually has, in
 * template order. Returns null — "ask for everything" — when the caller
 * didn't pick any, and rejects a selection that lands on nothing, which
 * would otherwise create a link with no questions on it.
 */
function resolveFieldKeys(template: Template, fieldKeys: string[] | undefined): string[] | null {
  if (!fieldKeys) return null;
  const keys = requestedFields(template.fields, fieldKeys).map((f) => f.key);
  if (keys.length === 0) {
    throw new ORPCError("BAD_REQUEST", { message: "Pick at least one field for this link" });
  }
  return keys.length === template.fields.length ? null : keys;
}

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: unknown }).code === "23505"
  );
}

/** The per-link ask: which fields to request, and the note shown with them. */
type FillRequestAsk = {
  fieldKeys: string[] | null;
  title: string | null;
  message: string | null;
};

/**
 * Inserts a fresh fill request row for a template, generating a random code.
 * Collisions are astronomically unlikely (14 nanoid characters) but retried a
 * few times rather than trusted away, since the code doubles as the link's
 * only access control.
 */
async function insertFillRequest(templateId: string, ask: FillRequestAsk): Promise<FillRequest> {
  const db = getDb();
  for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt++) {
    try {
      const [row] = await db
        .insert(fillRequests)
        .values({ templateId, code: nanoid(CODE_LENGTH), ...ask })
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
  /**
   * Owner-only: creates a new one-time fill link for a template. The owner
   * picks which fields the link asks for (omitted means all of them) and can
   * attach a title and note shown to whoever opens it.
   */
  create: protectedProcedure
    .input(
      z.object({
        templateId: z.string(),
        fieldKeys: z.array(z.string()).optional(),
        title: z.string().max(MAX_TITLE_LENGTH).optional(),
        message: z.string().max(MAX_MESSAGE_LENGTH).optional(),
      })
    )
    .handler(async ({ input, context }) => {
      const template = await loadOwnedTemplate(input.templateId, context.session.user.id);
      const fillRequest = await insertFillRequest(input.templateId, {
        fieldKeys: resolveFieldKeys(template, input.fieldKeys),
        title: trimmedOrNull(input.title),
        message: trimmedOrNull(input.message),
      });
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

  /**
   * Public: the fields a still-usable link asks for, plus the owner's title
   * and note — never the document itself.
   */
  getByCode: publicProcedure
    .input(z.object({ code: z.string() }))
    .handler(async ({ input, context }) => {
      await enforcePublicLinkRateLimit(context.headers);
      const { fillRequest, template } = await loadActiveFillRequest(input.code);
      return {
        templateName: template.name,
        fields: requestedFields(template.fields, fillRequest.fieldKeys),
        title: fillRequest.title,
        message: fillRequest.message,
      };
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
      const { fillRequest, template } = await loadActiveFillRequest(input.code);

      // Only what the link asked for is required or checked; `toFieldStrings`
      // still runs against the full template, so the fields left out are
      // stored blank rather than missing.
      const asked = templateForRequest(template, fillRequest.fieldKeys);
      const validationError = validateRow(asked, input.data, false);
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
