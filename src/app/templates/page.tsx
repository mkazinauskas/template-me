import { Suspense } from "react";
import { headers } from "next/headers";
import type { Metadata } from "next";
import { TemplateList } from "@/components/template-list";
import { TemplateSearchForm } from "@/components/template-search-form";
import { AppHeader } from "@/components/app-header";
import { auth } from "@/lib/auth";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Browse templates",
  robots: { index: false, follow: false },
};

export default async function TemplatesPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; ppage?: string; q?: string }>;
}) {
  const { page: pageParam, ppage: ppageParam, q } = await searchParams;
  const page = Math.max(1, Number(pageParam) || 1);
  const publicPage = Math.max(1, Number(ppageParam) || 1);
  const session = await auth.api.getSession({ headers: await headers() });

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black">
      <AppHeader user={session?.user} width="full" />
      <main className="mx-auto max-w-none px-6 py-10 flex flex-col gap-8">
        <div className="animate-fade-in-up flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Browse templates</h1>
          <p className="text-sm text-muted-foreground">
            Search templates and open one to fill it in.
          </p>
        </div>

        <div className="animate-fade-in-up" style={{ animationDelay: "0.1s" }}>
          <TemplateSearchForm defaultValue={q} />
        </div>

        <div className="animate-fade-in-up flex flex-col gap-3" style={{ animationDelay: "0.15s" }}>
          <h2 className="text-lg font-semibold">Your templates</h2>
          <Suspense
            key={`own-${page}-${q ?? ""}`}
            fallback={<p className="text-sm text-black/50">Loading…</p>}
          >
            <TemplateList scope="own" page={page} q={q} pageParam="page" />
          </Suspense>
        </div>

        <div className="animate-fade-in-up flex flex-col gap-3" style={{ animationDelay: "0.2s" }}>
          <h2 className="text-lg font-semibold">Public templates</h2>
          <Suspense
            key={`public-${publicPage}-${q ?? ""}`}
            fallback={<p className="text-sm text-black/50">Loading…</p>}
          >
            <TemplateList scope="public" page={publicPage} q={q} pageParam="ppage" />
          </Suspense>
        </div>
      </main>
    </div>
  );
}
