import { pgTable, text, timestamp, jsonb, uuid, boolean, integer, bigint, index, uniqueIndex } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

export type TemplateFieldType =
  | "string"
  | "number"
  | "date"
  | "boolean"
  | "select"
  | "checkbox"
  | "textarea"
  | "email"
  | "url"
  | "currency";

export type UserRole = "user" | "admin";

export type TemplateField = {
  key: string;
  label: string;
  type: TemplateFieldType;
  /** Type-specific arguments, e.g. a date format string or select options. */
  params: string[];
  /** Raw group name, e.g. "person" for a "person.first_name" tag. Undefined if the key has no dot. */
  group?: string;
  /** Human-readable group label, e.g. "Person". */
  groupLabel?: string;
};

// Better Auth core schema, generated with `npx @better-auth/cli generate`.
export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").default(false).notNull(),
  image: text("image"),
  role: text("role").$type<UserRole>().default("user").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at").notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .$onUpdate(() => new Date())
      .notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [index("session_userId_idx").on(table.userId)]
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    issuer: text("issuer").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at"),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("account_userId_idx").on(table.userId),
    uniqueIndex("account_providerId_accountId_idx").on(table.providerId, table.accountId),
  ]
);

export const verification = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index("verification_identifier_idx").on(table.identifier)]
);

// Better Auth's rate-limit table (see auth.ts's `rateLimit: { storage: "database" }`).
// Column/field names below match Better Auth's built-in field defaults —
// see @better-auth/core's buildAuthTables()'s `rateLimitTable`. Also reused
// by src/lib/rate-limit.ts for the app's own per-route rate limiting, keyed
// separately so the two don't collide.
export const rateLimit = pgTable("rate_limit", {
  id: text("id").primaryKey(),
  key: text("key").notNull().unique(),
  count: integer("count").notNull(),
  lastRequest: bigint("last_request", { mode: "number" }).notNull(),
});

export const userRelations = relations(user, ({ many }) => ({
  sessions: many(session),
  accounts: many(account),
  templates: many(templates),
}));

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, {
    fields: [session.userId],
    references: [user.id],
  }),
}));

export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, {
    fields: [account.userId],
    references: [user.id],
  }),
}));

export const templates = pgTable(
  "templates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    originalFilename: text("original_filename").notNull(),
    blobUrl: text("blob_url").notNull(),
    blobPathname: text("blob_pathname").notNull(),
    fields: jsonb("fields").$type<TemplateField[]>().notNull().default([]),
    // Owner of this template — only they can see it, fill it in, or generate
    // documents from it. Everyone else gets a 404, as if it didn't exist.
    // Nullable so templates that predate this column (no owner on record)
    // stay in the database but become inaccessible, instead of being deleted.
    userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
    // When true, anyone (signed in or not) can find this template, open it, fill
    // it in, and download the result. Only the owner can flip this flag or
    // delete the template. Defaults to false — templates start private.
    isPublic: boolean("is_public").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("templates_userId_idx").on(table.userId),
    index("templates_userId_createdAt_idx").on(table.userId, table.createdAt),
    index("templates_isPublic_createdAt_idx").on(table.isPublic, table.createdAt),
    uniqueIndex("templates_blobPathname_idx").on(table.blobPathname),
  ]
);

export const templatesRelations = relations(templates, ({ one }) => ({
  owner: one(user, {
    fields: [templates.userId],
    references: [user.id],
  }),
}));

export type Template = typeof templates.$inferSelect;
export type NewTemplate = typeof templates.$inferInsert;

// A one-time, shareable link an owner generates for a template: a random
// `code` stands in for a URL anyone can open (no sign-in) to fill in the
// template's fields — but not preview the document itself. The first
// successful submission stamps `filledAt` and the link is done: later opens
// or submits are rejected, same as if the owner had revoked it themselves.
// `revokedAt` covers the owner cancelling a link before anyone used it.
export const fillRequests = pgTable(
  "fill_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    templateId: uuid("template_id")
      .notNull()
      .references(() => templates.id, { onDelete: "cascade" }),
    code: text("code").notNull(),
    // The submitted values, once filled — same shape as a template-generate
    // request's `data`. Null until `filledAt` is set.
    data: jsonb("data").$type<Record<string, string>>(),
    filledAt: timestamp("filled_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("fill_requests_code_idx").on(table.code),
    index("fill_requests_templateId_createdAt_idx").on(table.templateId, table.createdAt),
  ]
);

export const fillRequestsRelations = relations(fillRequests, ({ one }) => ({
  template: one(templates, {
    fields: [fillRequests.templateId],
    references: [templates.id],
  }),
}));

export type FillRequest = typeof fillRequests.$inferSelect;
export type NewFillRequest = typeof fillRequests.$inferInsert;
