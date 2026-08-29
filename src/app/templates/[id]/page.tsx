import Link from "next/link";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { and, eq } from "drizzle-orm";
import { cache } from "react";
import type { Metadata } from "next";
import { getDb } from "@/db";
import { templates } from "@/db/schema";
import { auth } from "@/lib/auth";
import { FillForm } from "@/components/fill-form";
import { DeleteTemplateButton } from "@/components/delete-template-button";
import { Logo } from "@/components/logo";

const getTemplate = cache(async (id: string) => {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return undefined;
  const db = getDb();
  const [template] = await db
    .select()
    .from(templates)
    .where(and(eq(templates.id, id), eq(templates.userId, session.user.id)));
  return template;
});

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const template = await getTemplate(id);

  return {
    title: template ? template.name : "Template not found",
    description: template
      ? `Fill in "${template.name}" and download it as a PDF.`
      : undefined,
    robots: { index: false, follow: false },
  };
}

export default async function TemplatePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ warnings?: string }>;
}) {
  const { id } = await params;
  const { warnings: warningsParam } = await searchParams;
  const template = await getTemplate(id);

  if (!template) {
    notFound();
  }

  let warnings: string[] = [];
  if (warningsParam) {
    try {
      const parsed = JSON.parse(warningsParam);
      if (Array.isArray(parsed)) warnings = parsed.filter((w) => typeof w === "string");
    } catch {
      // ignore malformed query param
    }
  }

  return (
    <div className="h-screen flex flex-col bg-zinc-50 dark:bg-black overflow-hidden">
      <header className="shrink-0 px-6 py-4 border-b border-black/10 dark:border-white/15">
        <div className="flex items-center justify-between">
          <Link href="/" className="transition-transform hover:scale-[1.03]">
            <Logo size="sm" animated={false} />
          </Link>
          <Link
            href="/dashboard"
            className="text-sm text-black/50 dark:text-white/50 hover:underline"
          >
            ← All templates
          </Link>
        </div>
        <div className="flex items-center justify-between mt-2">
          <h1 className="text-xl font-semibold tracking-tight">{template.name}</h1>
          <DeleteTemplateButton templateId={template.id} />
        </div>
        <p className="text-sm text-black/60 dark:text-white/60 mt-0.5">
          {template.originalFilename}
        </p>
      </header>

      {warnings.length > 0 && (
        <div className="shrink-0 border-b border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 px-6 py-3 text-sm text-amber-800 dark:text-amber-300">
          <p className="font-medium">Some tags weren&apos;t fully understood</p>
          <ul className="mt-1 list-disc list-inside space-y-0.5">
            {warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </div>
      )}

      <main className="flex-1 min-h-0">
        <FillForm
          templateId={template.id}
          fields={template.fields}
          templateName={template.name}
        />
      </main>
    </div>
  );
}
