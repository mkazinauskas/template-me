import Link from "next/link";
import { Logo } from "@/components/logo";
import { buttonClasses } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black flex items-center justify-center px-6">
      <div className="flex flex-col items-center gap-6 text-center max-w-md">
        <Link href="/" className="transition-transform hover:scale-[1.03]">
          <Logo />
        </Link>
        <div className="flex flex-col gap-2">
          <h1 className="text-xl font-semibold tracking-tight">Page not found</h1>
          <p className="text-sm text-muted-foreground">
            The page you&apos;re looking for doesn&apos;t exist or may have been moved.
          </p>
        </div>
        <Link href="/dashboard" className={buttonClasses()}>
          Go to dashboard
        </Link>
      </div>
    </div>
  );
}
