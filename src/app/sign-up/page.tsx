import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import type { Metadata } from "next";
import { AuthForm } from "@/components/auth-form";
import { isGoogleAuthEnabled } from "@/lib/auth-providers";
import { Logo } from "@/components/logo";

export const metadata: Metadata = {
  title: "Sign up",
  robots: { index: false, follow: false },
};

export default async function SignUpPage() {
  // Read at request time, not build time: whether Google sign-in is offered
  // follows the deployment's env vars, so toggling GOOGLE_CLIENT_ID takes
  // effect without a rebuild.
  await connection();
  const googleEnabled = isGoogleAuthEnabled();

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black flex flex-col items-center justify-center gap-8 px-6 py-10">
      <Link href="/" className="transition-transform hover:scale-[1.03]">
        <Logo />
      </Link>
      <Suspense>
        <AuthForm mode="sign-up" googleEnabled={googleEnabled} />
      </Suspense>
      <Link
        href="/"
        className="text-sm text-muted-foreground underline underline-offset-2"
      >
        ← Back to home
      </Link>
    </div>
  );
}
