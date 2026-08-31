import { neon } from "@neondatabase/serverless";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-http";
import { drizzle as drizzleNodePg } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

function createDb() {
  // Local Docker Compose runs a plain Postgres container, which the
  // Neon HTTP driver can't talk to (it speaks Neon's fetch-based data API,
  // not the Postgres wire protocol) — use node-postgres there instead.
  // Both drivers implement the same drizzle query builder surface that this
  // app relies on (select/insert/update/delete), so the two are used
  // interchangeably behind `getDb()`.
  if (process.env.LOCAL_MODE === "true") {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL! });
    // Without this listener, an error on an idle pooled client (e.g. the
    // backend restarting the connection) is emitted as an unhandled "error"
    // event and crashes the process — see node-postgres's Pool docs.
    pool.on("error", (err) => {
      console.error("Unexpected error on idle Postgres client", err);
    });
    return drizzleNodePg(pool, { schema }) as unknown as ReturnType<typeof drizzleNeon>;
  }
  const sql = neon(process.env.DATABASE_URL!);
  return drizzleNeon(sql, { schema });
}

let _db: ReturnType<typeof createDb> | null = null;

export function getDb() {
  if (!_db) _db = createDb();
  return _db;
}
