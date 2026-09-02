"use client";

import { useState } from "react";
import Link from "next/link";
import { authClient } from "@/lib/auth-client";
import { inputClasses } from "@/components/ui/input";
import { buttonClasses } from "@/components/ui/button";
import { AuthCard, FormError } from "./auth-card";
import { useAuthRedirect } from "./use-auth-redirect";

/** Email one-time-code sign-in: send a code to an email address, then verify it. */
export function OtpAuthForm({ mode }: { mode: "sign-in" | "sign-up" }) {
  const { goToApp } = useAuthRedirect();
  const [step, setStep] = useState<"email" | "code">("email");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    goToApp();
  }

  const subtitle =
    step === "email"
      ? mode === "sign-up"
        ? "Your templates are only visible to you."
        : "Sign in to see your templates."
      : `Enter the code we sent to ${email}.`;

  return (
    <AuthCard
      mode={mode}
      subtitle={subtitle}
      error={error}
      onSubmit={step === "email" ? handleSendCode : handleVerifyCode}
    >
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
                className={inputClasses}
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
              className={inputClasses}
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
            className={inputClasses}
          />
        </div>
      )}

      <FormError message={error} />

      <button type="submit" disabled={isSubmitting} className={buttonClasses()}>
        {isSubmitting ? "Please wait…" : step === "email" ? "Send code" : "Verify code"}
      </button>

      {step === "code" && (
        <button
          type="button"
          onClick={() => {
            setStep("email");
            setCode("");
            setError(null);
          }}
          className="text-sm text-muted-foreground underline underline-offset-2 self-start"
        >
          Use a different email
        </button>
      )}

      <p className="text-sm text-muted-foreground">
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
    </AuthCard>
  );
}
