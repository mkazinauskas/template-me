"use client"; // Error boundaries must be Client Components

import { useEffect } from "react";
import Link from "next/link";
import { Logo } from "@/components/logo";
import { buttonClasses } from "@/components/ui/button";

export default function Error({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black flex items-center justify-center px-6">
      <div className="flex flex-col items-center gap-6 text-center max-w-md">
        <Link href="/" className="transition-transform hover:scale-[1.03]">
          <Logo />
        </Link>
        <div className="flex flex-col gap-2">
          <h1 className="text-xl font-semibold tracking-tight">Something went wrong</h1>
          <p role="alert" className="text-sm text-muted-foreground">
            An unexpected error occurred. You can try again, or head back to the dashboard.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => retry()} className={buttonClasses()}>
            Try again
          </button>
          <Link href="/dashboard" className={buttonClasses({ variant: "secondary" })}>
            Go to dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
