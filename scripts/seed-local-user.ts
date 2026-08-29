import { APIError } from "better-auth";
import { auth } from "../src/lib/auth";

async function main() {
  const email = process.env.LOCAL_AUTH_EMAIL || "demo@example.com";
  const password = process.env.LOCAL_AUTH_PASSWORD || "localpassword123";
  const name = process.env.LOCAL_AUTH_NAME || "Local User";

  try {
    await auth.api.signUpEmail({ body: { email, password, name } });
    console.log(`Seeded local user ${email}`);
  } catch (err) {
    if (err instanceof APIError && err.status === "UNPROCESSABLE_ENTITY") {
      console.log(`Local user ${email} already exists, skipping`);
      return;
    }
    throw err;
  }
}

main().catch((err) => {
  console.error("Failed to seed local user:", err);
  process.exit(1);
});
