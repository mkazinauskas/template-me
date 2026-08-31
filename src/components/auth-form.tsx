"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { authClient } from "@/lib/auth-client";
import { inputClasses } from "@/components/ui/input";
import { buttonClasses } from "@/components/ui/button";

// Local Docker Compose has no Resend account to send OTP emails with, so it
// seeds one static account (see scripts/seed-local-user.ts) and signs in
// with a plain email/password form instead of the OTP flow below.
const LOCAL_MODE = process.env.NEXT_PUBLIC_LOCAL_MODE === "true";
const LOCAL_EMAIL = process.env.NEXT_PUBLIC_LOCAL_AUTH_EMAIL ?? "";
const LOCAL_PASSWORD = process.env.NEXT_PUBLIC_LOCAL_AUTH_PASSWORD ?? "";

export function AuthForm({ mode }: { mode: "sign-in" | "sign-up" }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirect") || "/dashboard";

  const [step, setStep] = useState<"email" | "code">("email");
  const [name, setName] = useState("");
  const [email, setEmail] = useState(LOCAL_MODE ? LOCAL_EMAIL : "");
  const [password, setPassword] = useState(LOCAL_MODE ? LOCAL_PASSWORD : "");
  const [code, setCode] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleLocalSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const { error: authError } =
      mode === "sign-up"
        ? await authClient.signUp.email({ email, password, name: name || email })
        : await authClient.signIn.email({ email, password });

    setIsSubmitting(false);
    if (authError) {
      setError(authError.message ?? "Something went wrong");
      return;
    }
    router.push(redirectTo);
    router.refresh();
  }

  async function handleSendCode(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const { error: authError } = await authClient.emailOtp.sendVerificationOtp({
      email,
      type: "sign-in",
    });

    setIsSubmitting(false);
    if (authError) {
      setError(authError.message ?? "Something went wrong");
      return;
    }
    setStep("code");
  }

  async function handleVerifyCode(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const { error: authError } = await authClient.signIn.emailOtp({
      email,
      otp: code,
      ...(name ? { name } : {}),
    });

    setIsSubmitting(false);
    if (authError) {
      setError(authError.message ?? "Something went wrong");
      return;
    }
    router.push(redirectTo);
    router.refresh();
  }

  if (LOCAL_MODE) {
    return (
      <form
        onSubmit={handleLocalSubmit}
        className="rounded-xl border border-black/10 dark:border-white/15 p-6 flex flex-col gap-4 w-full max-w-sm"
      >
        <div>
          <h1 className="text-lg font-semibold">
            {mode === "sign-up" ? "Create an account" : "Sign in"}
          </h1>
          <p className="text-sm text-black/60 dark:text-white/60 mt-1">
            Local development sign-in (no email required).
          </p>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="email" className="text-sm font-medium">
            Email
          </label>
          <input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="rounded-md border border-black/15 dark:border-white/20 bg-transparent px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/20 dark:focus:ring-white/30"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="password" className="text-sm font-medium">
            Password
          </label>
          <input
            id="password"
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="rounded-md border border-black/15 dark:border-white/20 bg-transparent px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/20 dark:focus:ring-white/30"
          />
        </div>

        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

        <button
          type="submit"
          disabled={isSubmitting}
          className="rounded-md bg-black text-white dark:bg-white dark:text-black px-4 py-2 text-sm font-medium disabled:opacity-50"
        >
          {isSubmitting ? "Please wait…" : mode === "sign-up" ? "Create account" : "Sign in"}
        </button>
      </form>
    );
  }

  return (
    <form
      onSubmit={step === "email" ? handleSendCode : handleVerifyCode}
      className="rounded-xl border border-black/10 dark:border-white/15 p-6 flex flex-col gap-4 w-full max-w-sm"
    >
      <div>
        <h1 className="text-lg font-semibold">
          {mode === "sign-up" ? "Create an account" : "Sign in"}
        </h1>
        <p className="text-sm text-black/60 dark:text-white/60 mt-1">
          {step === "email"
            ? mode === "sign-up"
              ? "Your templates are only visible to you."
              : "Sign in to see your templates."
            : `Enter the code we sent to ${email}.`}
        </p>
      </div>

      {step === "email" ? (
        <>
          {mode === "sign-up" && (
            <div className="flex flex-col gap-1.5">
              <label htmlFor="name" className="text-sm font-medium">
                Name
              </label>
              <input
                id="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="rounded-md border border-black/15 dark:border-white/20 bg-transparent px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/20 dark:focus:ring-white/30"
              />
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <label htmlFor="email" className="text-sm font-medium">
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="rounded-md border border-black/15 dark:border-white/20 bg-transparent px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/20 dark:focus:ring-white/30"
            />
          </div>
        </>
      ) : (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="code" className="text-sm font-medium">
            Code
          </label>
          <input
            id="code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            required
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className="rounded-md border border-black/15 dark:border-white/20 bg-transparent px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/20 dark:focus:ring-white/30"
          />
        </div>
      )}

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      <button
        type="submit"
        disabled={isSubmitting}
        className="rounded-md bg-black text-white dark:bg-white dark:text-black px-4 py-2 text-sm font-medium disabled:opacity-50"
      >
        {isSubmitting
          ? "Please wait…"
          : step === "email"
            ? "Send code"
            : "Verify code"}
      </button>

      {step === "code" && (
        <button
          type="button"
          onClick={() => {
            setStep("email");
            setCode("");
            setError(null);
          }}
          className="text-sm text-black/60 dark:text-white/60 underline underline-offset-2 self-start"
        >
          Use a different email
        </button>
      )}

      <p className="text-sm text-black/60 dark:text-white/60">
        {mode === "sign-up" ? (
          <>
            Already have an account?{" "}
            <Link href="/sign-in" className="underline underline-offset-2">
              Sign in
            </Link>
          </>
        ) : (
          <>
            Need an account?{" "}
            <Link href="/sign-up" className="underline underline-offset-2">
              Sign up
            </Link>
          </>
        )}
      </p>
    </form>
  );
}
