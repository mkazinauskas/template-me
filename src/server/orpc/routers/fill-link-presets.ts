import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { and, asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { fillLinkPresets } from "@/db/schema";
import { protectedProcedure } from "@/server/orpc/base";
import { requiredMessage, requiredTitle } from "@/server/orpc/routers/fill-requests";

const MAX_NAME_LENGTH = 100;

const presetInput = z.object({
  name: z.string().trim().min(1, "Give the preset a name").max(MAX_NAME_LENGTH),
  title: requiredTitle,
  message: requiredMessage,
});

const NOT_FOUND = "Preset not found";

/**
 * Saved title + message pairs for fill links. Every procedure is scoped to
 * the signed-in user; another user's preset id behaves as if it didn't exist.
 */
export const fillLinkPresetsRouter = {
  /** The caller's presets, alphabetically by name. */
  list: protectedProcedure.handler(async ({ context }) => {
    const db = getDb();
    const rows = await db
      .select()
      .from(fillLinkPresets)
      .where(eq(fillLinkPresets.userId, context.session.user.id))
      .orderBy(asc(fillLinkPresets.name));
    return { presets: rows };
  }),

  create: protectedProcedure
    .input(presetInput)
    .handler(async ({ input, context }) => {
      const db = getDb();
      const [preset] = await db
        .insert(fillLinkPresets)
        .values({ userId: context.session.user.id, ...input })
        .returning();
      return { preset };
    }),

  update: protectedProcedure
    .input(presetInput.extend({ id: z.string().uuid() }))
    .handler(async ({ input, context }) => {
      const db = getDb();
      const [preset] = await db
        .update(fillLinkPresets)
        .set({ name: input.name, title: input.title, message: input.message })
        .where(
          and(
            eq(fillLinkPresets.id, input.id),
            eq(fillLinkPresets.userId, context.session.user.id),
          ),
        )
        .returning();
      if (!preset) throw new ORPCError("NOT_FOUND", { message: NOT_FOUND });
      return { preset };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .handler(async ({ input, context }) => {
      const db = getDb();
      const [deleted] = await db
        .delete(fillLinkPresets)
        .where(
          and(
            eq(fillLinkPresets.id, input.id),
            eq(fillLinkPresets.userId, context.session.user.id),
          ),
        )
        .returning({ id: fillLinkPresets.id });
      if (!deleted) throw new ORPCError("NOT_FOUND", { message: NOT_FOUND });
      return { id: deleted.id };
    }),
};
