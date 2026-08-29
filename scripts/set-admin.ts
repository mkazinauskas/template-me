import { eq } from "drizzle-orm";
import { getDb } from "../src/db";
import { user } from "../src/db/schema";

async function main() {
  const email = process.argv[2];
  if (!email) {
    console.error("Usage: npm run set-admin -- <email>");
    process.exit(1);
  }

  const db = getDb();
  const [updated] = await db
    .update(user)
    .set({ role: "admin" })
    .where(eq(user.email, email))
    .returning({ id: user.id, email: user.email });

  if (!updated) {
    console.error(`No user found with email ${email}`);
    process.exit(1);
  }

  console.log(`${updated.email} is now an admin`);
}

main().catch((err) => {
  console.error("Failed to set admin:", err);
  process.exit(1);
});
