import { APIError } from "better-auth";

// Sign-up is disabled by default so the running app can't be self-registered
// against (see src/lib/auth.ts). This script is the one legitimate caller, so
// it opts itself in — before importing the auth instance, since betterAuth()
// reads the flag at construction time. That import therefore has to be dynamic:
// a static one would be hoisted above this assignment.
process.env.LOCAL_ALLOW_SIGNUP = "true";

async function main() {
  const { auth } = await import("../src/lib/auth");

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
