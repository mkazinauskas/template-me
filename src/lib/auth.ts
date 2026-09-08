import { env } from "@/lib/env";
import { betterAuth } from "better-auth";
import { createAuthMiddleware } from "better-auth/api";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { emailOTP } from "better-auth/plugins/email-otp";
import { getDb } from "@/db";
import * as schema from "@/db/schema";
import { logAuthEvent } from "@/lib/auth-events";
import { googleCredentials } from "@/lib/auth-providers";
import { sendEmail } from "@/lib/email";

const google = googleCredentials();

export const auth = betterAuth({
  database: drizzleAdapter(getDb(), { provider: "pg", schema }),
  // Local Docker Compose has no Resend account to send OTP emails with, so
  // it seeds one static account (see scripts/seed-local-user.ts) and signs
  // in with a plain password instead — see AuthForm's LOCAL_MODE branch.
  emailAndPassword: {
    enabled: env.LOCAL_MODE,
    // Enabling credential login also exposes `POST /api/auth/sign-up/email`,
    // which would let anyone who can reach a LOCAL_MODE deployment (the
    // published demo image included) register an account by raw HTTP request,
    // even though the UI only ever offers the one seeded login. The web server
    // never sets LOCAL_ALLOW_SIGNUP, so sign-up stays closed there; only
    // scripts/seed-local-user.ts — a separate process, run once at startup —
    // sets it to create that static account.
    disableSignUp: !env.LOCAL_ALLOW_SIGNUP,
  },
  // Only registered when both credentials are set, so a deployment without
  // them exposes no half-working `/api/auth/sign-in/social` endpoint (see
  // auth-providers.ts, which also gates the button in the UI).
  socialProviders: google ? { google } : undefined,
  account: {
    accountLinking: {
      // Without this, someone who first signed in with an email code and later
      // clicks "Continue with Google" gets an error instead of their account —
      // better-auth refuses to attach an OAuth account to an existing email by
      // default. Trusting Google specifically is what makes that safe: it only
      // returns addresses it has verified, so the link can't be used to take
      // over an account by asserting someone else's email. Any provider not
      // listed here still goes through the default, stricter path.
      enabled: true,
      trustedProviders: ["google"],
    },
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
  // Vercel runs multiple (Fluid Compute) instances of this app, so the
  // default in-memory rate-limit store doesn't share state across them —
  // each instance would enforce its own separate limit. Persisting counts in
  // Postgres (via the `rateLimit` table/model in db/schema.ts) instead makes
  // the limit actually hold across instances.
  rateLimit: {
    storage: "database",
    // These paths are the entire brute-force surface of sign-in, and until now
    // their limits came from better-auth's own defaults — which a version bump
    // could loosen without anything here noticing. Pinned at the values the
    // library currently applies so the posture is explicit and a regression
    // shows up as a diff. 3 per minute on `/sign-in/email-otp` also matches the
    // OTP's own 3-wrong-guesses-and-the-code-dies cap (emailOTP's
    // `allowedAttempts` default), so a looser limit here would buy an attacker
    // nothing anyway.
    customRules: {
      "/sign-in/email-otp": { window: 60, max: 3 },
      "/email-otp/send-verification-otp": { window: 60, max: 3 },
      "/email-otp/verify-email": { window: 60, max: 3 },
      // Only reachable in LOCAL_MODE (see `emailAndPassword` above), where a
      // password is accepted — but the seeded demo account's password is
      // guessable, so keep the published demo image throttled too.
      "/sign-in/email": { window: 10, max: 3 },
      // Not a guessing surface, but it is unauthenticated and every call
      // persists an OAuth state row for 10 minutes before the browser has gone
      // anywhere, so it is worth a bound. Pinned at better-auth's own default
      // for `/sign-in/*` for the same reason as the paths above: so a version
      // bump can't loosen it without showing up as a diff here.
      "/sign-in/social": { window: 10, max: 3 },
    },
  },
  advanced: {
    ipAddress: {
      // better-auth reads `x-forwarded-for` by default and, with no
      // `trustedProxies` configured, refuses to trust it whenever it carries
      // more than one hop — falling back to a single shared per-path bucket for
      // *every* caller. Behind a self-hosted proxy that appends a hop, that
      // turns a 3-per-minute sign-in limit into a global one: one attacker
      // hammering sign-in would lock every user out. These headers are all
      // single-valued on Vercel, and `x-vercel-forwarded-for` additionally
      // survives a proxy stacked on top of it.
      ipAddressHeaders: ["x-vercel-forwarded-for", "x-real-ip", "x-forwarded-for"],
    },
  },
  hooks: {
    // Runs after every auth endpoint, for both successes and failures (a failed
    // endpoint leaves an APIError in `context.returned` rather than throwing).
    // `logAuthEvent` filters down to the sign-in paths and swallows its own
    // errors — a throw here that isn't an APIError would propagate out of the
    // request, so it must never be able to break sign-in.
    after: createAuthMiddleware(async (ctx) => {
      logAuthEvent({
        path: ctx.path,
        body: ctx.body,
        headers: ctx.headers,
        returned: ctx.context.returned,
        newSession: ctx.context.newSession,
      });
    }),
  },
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.SITE_URL,
  // `next dev` picks a different port when the default is already in use,
  // so pin the origin check to the deployed URL but allow any localhost
  // port in development instead of hardcoding one.
  trustedOrigins: env.NODE_ENV === "production" ? undefined : ["http://localhost:*"],
});
