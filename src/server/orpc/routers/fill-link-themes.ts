import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { and, asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { fillLinkThemes } from "@/db/schema";
import { fillLinkThemeColors } from "@/lib/fill-link-theme";
import { protectedProcedure } from "@/server/orpc/base";

const MAX_NAME_LENGTH = 100;

const themeInput = z.object({
  name: z.string().trim().min(1, "Give the theme a name").max(MAX_NAME_LENGTH),
  colors: fillLinkThemeColors,
});

const NOT_FOUND = "Theme not found";

/**
 * Saved page color themes for fill links. Every procedure is scoped to the
 * signed-in user; another user's theme id behaves as if it didn't exist.
 */
export const fillLinkThemesRouter = {
  /** The caller's themes, alphabetically by name. */
  list: protectedProcedure.handler(async ({ context }) => {
    const db = getDb();
    const rows = await db
      .select()
      .from(fillLinkThemes)
      .where(eq(fillLinkThemes.userId, context.session.user.id))
      .orderBy(asc(fillLinkThemes.name));
    return { themes: rows };
  }),

  create: protectedProcedure
    .input(themeInput)
    .handler(async ({ input, context }) => {
      const db = getDb();
      const [theme] = await db
        .insert(fillLinkThemes)
        .values({ userId: context.session.user.id, ...input })
        .returning();
      return { theme };
    }),

  update: protectedProcedure
    .input(themeInput.extend({ id: z.string().uuid() }))
    .handler(async ({ input, context }) => {
      const db = getDb();
      const [theme] = await db
        .update(fillLinkThemes)
        .set({ name: input.name, colors: input.colors })
        .where(
          and(
            eq(fillLinkThemes.id, input.id),
            eq(fillLinkThemes.userId, context.session.user.id),
          ),
        )
        .returning();
      if (!theme) throw new ORPCError("NOT_FOUND", { message: NOT_FOUND });
      return { theme };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .handler(async ({ input, context }) => {
      const db = getDb();
      const [deleted] = await db
        .delete(fillLinkThemes)
        .where(
          and(
            eq(fillLinkThemes.id, input.id),
            eq(fillLinkThemes.userId, context.session.user.id),
          ),
        )
        .returning({ id: fillLinkThemes.id });
      if (!deleted) throw new ORPCError("NOT_FOUND", { message: NOT_FOUND });
      return { id: deleted.id };
    }),
};
