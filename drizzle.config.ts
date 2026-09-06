import { defineConfig } from "drizzle-kit";
import { env } from "./src/lib/env";

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    // Non-null: DATABASE_URL is required in production (see src/lib/env.ts),
    // and drizzle-kit is only ever run against a configured database.
    url: env.DATABASE_URL!,
  },
});
