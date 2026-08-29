import { Suspense } from "react";
import Link from "next/link";
import { headers } from "next/headers";
import type { Metadata } from "next";
import { UploadForm } from "@/components/upload-form";
import { TemplateList } from "@/components/template-list";
import { Logo } from "@/components/logo";
import { SignOutButton } from "@/components/sign-out-button";
import { auth } from "@/lib/auth";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Dashboard",
  robots: { index: false, follow: false },
};

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { page: pageParam } = await searchParams;
  const page = Math.max(1, Number(pageParam) || 1);
  const session = await auth.api.getSession({ headers: await headers() });

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black">
      <main className="mx-auto max-w-5xl px-6 py-10 flex flex-col gap-10">
        <div className="flex items-center justify-between">
          <Link href="/" className="transition-transform hover:scale-[1.03]">
            <Logo size="sm" />
          </Link>
          <div className="flex items-center gap-4">
            {session && (
              <span className="hidden sm:inline text-sm text-black/40 dark:text-white/40">
                {session.user.email}
              </span>
            )}
            <Link
              href="/templates"
              className="shrink-0 text-sm text-black/50 dark:text-white/50 hover:underline"
            >
              Browse templates
            </Link>
            {session?.user.role === "admin" && (
              <Link
                href="/admin"
                className="shrink-0 text-sm text-black/50 dark:text-white/50 hover:underline"
              >
                Admin
              </Link>
            )}
            <Link
              href="/"
              className="shrink-0 text-sm text-black/50 dark:text-white/50 hover:underline"
            >
              ← Home
            </Link>
            <SignOutButton />
          </div>
        </div>

        <div className="animate-fade-in-up flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              Docx Template → PDF
            </h1>
            <p className="text-sm text-black/60 dark:text-white/60 mt-1">
              Upload a Word template, fill in the detected fields, and download
              a filled-in PDF.
            </p>
          </div>
        </div>

        <div className="animate-fade-in-up max-w-3xl" style={{ animationDelay: "0.1s" }}>
          <UploadForm />
        </div>

        <div
          className="animate-fade-in-up flex flex-col gap-3"
          style={{ animationDelay: "0.2s" }}
        >
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Your templates</h2>
            <Link
              href="/templates"
              className="text-sm text-black/50 dark:text-white/50 hover:underline"
            >
              Browse all →
            </Link>
          </div>
          <Suspense key={page} fallback={<p className="text-sm text-black/50">Loading…</p>}>
            <TemplateList page={page} />
          </Suspense>
        </div>
      </main>
    </div>
  );
}
