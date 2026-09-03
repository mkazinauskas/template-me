import { Suspense } from "react";
import { headers } from "next/headers";
import type { Metadata } from "next";
import { TemplateList } from "@/components/template-list";
import { TemplateSearchForm } from "@/components/template-search-form";
import { AppHeader } from "@/components/app-header";
import { auth } from "@/lib/auth";

export const dynamic = "force-dynamic";

const HREF_BASE = "/public/templates";

/** How many public templates a logged-out visitor may browse before signing in. */
export const PUBLIC_PREVIEW_LIMIT = 5;

export const metadata: Metadata = {
  title: "Browse templates",
  robots: { index: false, follow: false },
};

export default async function PublicTemplatesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const session = await auth.api.getSession({ headers: await headers() });

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black">
      <AppHeader user={session?.user} />
      <main className="mx-auto max-w-[var(--content-max)] px-6 py-10 flex flex-col gap-10">
        <div className="animate-fade-in-up flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Browse templates</h1>
          <p className="text-sm text-muted-foreground">
            Open a ready-made template, fill it in, and download a finished PDF — no account needed.
          </p>
        </div>

        <div className="animate-fade-in-up" style={{ animationDelay: "0.1s" }}>
          <TemplateSearchForm defaultValue={q} />
        </div>

        <section
          className="animate-fade-in-up flex flex-col gap-3"
          style={{ animationDelay: "0.15s" }}
        >
          <div className="flex items-baseline justify-between gap-4">
            <h2 className="text-lg font-semibold">Public templates</h2>
            <span className="text-xs text-muted-foreground">
              Showing up to {PUBLIC_PREVIEW_LIMIT}
            </span>
          </div>
          <Suspense
            key={`public-preview-${q ?? ""}`}
            fallback={<p className="text-sm text-muted-foreground">Loading…</p>}
          >
            <TemplateList
              scope="public"
              q={q}
              preview={{ limit: PUBLIC_PREVIEW_LIMIT }}
              hrefBase={HREF_BASE}
            />
          </Suspense>
        </section>
      </main>
    </div>
  );
}
