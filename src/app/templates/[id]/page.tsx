import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { cache } from "react";
import type { Metadata } from "next";
import { getDb } from "@/db";
import { templates } from "@/db/schema";
import { auth } from "@/lib/auth";
import { canViewTemplate, isTemplateOwner } from "@/lib/template-access";
import { FillForm } from "@/components/fill-form";
import { DeleteTemplateButton } from "@/components/delete-template-button";
import { PublishToggle } from "@/components/publish-toggle";
import { AppHeader } from "@/components/app-header";

const getSession = cache(async () =>
  auth.api.getSession({ headers: await headers() })
);

const getTemplate = cache(async (id: string) => {
  const session = await getSession();
  const db = getDb();
  const [template] = await db.select().from(templates).where(eq(templates.id, id));
  if (!template || !canViewTemplate(template, session?.user.id)) return undefined;
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
  const [template, session] = await Promise.all([getTemplate(id), getSession()]);

  if (!template) {
    notFound();
  }

  const isOwner = isTemplateOwner(template, session?.user.id);

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
      <AppHeader user={session?.user} />
      <div className="shrink-0 border-b border-border">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-6 py-4">
          <div className="min-w-0">
            <h1 className="text-xl font-semibold tracking-tight truncate">
              {template.name}
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5 truncate">
              {template.originalFilename}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            {isOwner ? (
              <>
                <PublishToggle templateId={template.id} isPublic={template.isPublic} />
                <DeleteTemplateButton templateId={template.id} />
              </>
            ) : (
              template.isPublic && (
                <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                  Public template
                </span>
              )
            )}
          </div>
        </div>
      </div>

      {warnings.length > 0 && (
        <div className="shrink-0 border-b border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 text-sm text-amber-800 dark:text-amber-300">
          <div className="mx-auto w-full max-w-6xl px-6 py-3">
            <p className="font-medium">Some tags weren&apos;t fully understood</p>
            <ul className="mt-1 list-disc list-inside space-y-0.5">
              {warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <main className="mx-auto flex w-full max-w-6xl flex-1 min-h-0 flex-col">
        <FillForm
          templateId={template.id}
          fields={template.fields}
          templateName={template.name}
        />
      </main>
    </div>
  );
}
