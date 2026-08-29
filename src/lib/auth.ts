import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { emailOTP } from "better-auth/plugins/email-otp";
import { getDb } from "@/db";
import * as schema from "@/db/schema";
import { sendEmail } from "@/lib/email";

const siteUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL
  ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  : process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : process.env.BETTER_AUTH_URL || "http://localhost:3000";

export const auth = betterAuth({
  database: drizzleAdapter(getDb(), { provider: "pg", schema }),
  // Local Docker Compose has no Resend account to send OTP emails with, so
  // it seeds one static account (see scripts/seed-local-user.ts) and signs
  // in with a plain password instead — see AuthForm's LOCAL_MODE branch.
  emailAndPassword: {
    enabled: process.env.LOCAL_MODE === "true",
  },
  user: {
    additionalFields: {
      // `input: false` keeps this out of sign-up/update request bodies —
      // promoting a user to admin is a DB-side action (see scripts/set-admin.ts),
      // never something a client can set on itself.
      role: { type: "string", input: false, defaultValue: "user" },
    },
  },
  plugins: [
    emailOTP({
      async sendVerificationOTP({ email, otp }) {
        await sendEmail({
          to: email,
          subject: "Your sign-in code",
          text: `Your sign-in code is ${otp}. It expires in 5 minutes.`,
        });
      },
    }),
  ],
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: siteUrl,
  // `next dev` picks a different port when the default is already in use,
  // so pin the origin check to the deployed URL but allow any localhost
  // port in development instead of hardcoding one.
  trustedOrigins: process.env.NODE_ENV === "production" ? undefined : ["http://localhost:*"],
});
