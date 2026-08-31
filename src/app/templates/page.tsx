import { Suspense } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { TemplateList } from "@/components/template-list";
import { TemplateSearchForm } from "@/components/template-search-form";
import { Logo } from "@/components/logo";
import { SignOutButton } from "@/components/sign-out-button";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Browse templates",
  robots: { index: false, follow: false },
};

export default async function TemplatesPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; q?: string }>;
}) {
  const { page: pageParam, q } = await searchParams;
  const page = Math.max(1, Number(pageParam) || 1);

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black">
      <main className="mx-auto max-w-5xl px-6 py-10 flex flex-col gap-8">
        <div className="flex flex-wrap items-center justify-between gap-y-2">
          <Link href="/" className="transition-transform hover:scale-[1.03]">
            <Logo size="sm" />
          </Link>
          <div className="flex items-center gap-4">
            <Link
              href="/dashboard"
              className="shrink-0 text-sm text-black/50 dark:text-white/50 hover:underline"
            >
              Upload new
            </Link>
            <Link
              href="/"
              className="shrink-0 text-sm text-black/50 dark:text-white/50 hover:underline"
            >
              ← Home
            </Link>
            <SignOutButton />
          </div>
        </div>

        <div className="animate-fade-in-up flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Browse templates</h1>
          <p className="text-sm text-black/60 dark:text-white/60">
            Search your uploaded templates and open one to fill it in.
          </p>
        </div>

        <div className="animate-fade-in-up" style={{ animationDelay: "0.1s" }}>
          <TemplateSearchForm defaultValue={q} />
        </div>

        <Suspense
          key={`${page}-${q ?? ""}`}
          fallback={<p className="text-sm text-black/50">Loading…</p>}
        >
          <TemplateList page={page} q={q} />
        </Suspense>
      </main>
    </div>
  );
}
