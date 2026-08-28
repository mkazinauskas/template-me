import { pgTable, text, timestamp, jsonb, uuid } from "drizzle-orm/pg-core";

export type TemplateFieldType = "string" | "number" | "date" | "boolean" | "select";

export type TemplateField = {
  key: string;
  label: string;
  type: TemplateFieldType;
  /** Type-specific arguments, e.g. a date format string or select options. */
  params: string[];
};

export const templates = pgTable("templates", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  originalFilename: text("original_filename").notNull(),
  blobUrl: text("blob_url").notNull(),
  blobPathname: text("blob_pathname").notNull(),
  fields: jsonb("fields").$type<TemplateField[]>().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Template = typeof templates.$inferSelect;
export type NewTemplate = typeof templates.$inferInsert;
