import { Suspense } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { AuthForm } from "@/components/auth-form";
import { Logo } from "@/components/logo";

export const metadata: Metadata = {
  title: "Sign in",
  robots: { index: false, follow: false },
};

export default function SignInPage() {
  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black flex flex-col items-center justify-center gap-8 px-6 py-10">
      <Link href="/" className="transition-transform hover:scale-[1.03]">
        <Logo />
      </Link>
      <Suspense>
        <AuthForm mode="sign-in" />
      </Suspense>
    </div>
  );
}
