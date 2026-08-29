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
