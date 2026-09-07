import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { cache } from "react";
import { getDb } from "@/db";
import { templates } from "@/db/schema";
import { auth } from "@/lib/auth";
import { canViewTemplate, isTemplateOwner } from "@/lib/template-access";
import { FillForm } from "@/components/fill-form";
import { fillModeLabel, isOwnerOnlyMode, type FillMode } from "@/lib/template-routes";
import { DeleteTemplateButton } from "@/components/delete-template-button";
import { DownloadTemplateButton } from "@/components/download-template-button";
import { PublishToggle } from "@/components/publish-toggle";
import { AppHeader } from "@/components/app-header";

const getSession = cache(async () =>
  auth.api.getSession({ headers: await headers() })
);

/**
 * Fetch a template by id, enforcing {@link canViewTemplate} (owner, or the
 * template is public). Shared by {@link TemplateDetail} and
 * {@link templateMetadata} across every template route, so the DB hit is
 * de-duplicated per request.
 */
const getTemplate = cache(async (id: string) => {
  const session = await getSession();
  const db = getDb();
  const [template] = await db.select().from(templates).where(eq(templates.id, id));
  if (!template || !canViewTemplate(template, session?.user.id)) return undefined;
  return template;
});

const MODE_DESCRIPTION: Record<FillMode, (name: string) => string> = {
  single: (name) => `Fill in "${name}" and download it as a PDF.`,
  bulk: (name) => `Create many documents from "${name}" at once from a spreadsheet.`,
  send: (name) => `Send a one-time link that lets someone else fill in "${name}".`,
};

/**
 * Shared `generateMetadata` body for every template route — both audiences and
 * all three fill modes. Templates are never indexed, hidden or not.
 */
export async function templateMetadata(
  id: string,
  mode: FillMode = "single"
): Promise<Metadata> {
  const template = await getTemplate(id);
  const robots = { index: false, follow: false };
  if (!template) return { title: "Template not found", robots };

  return {
    title:
      mode === "single" ? template.name : `${template.name} — ${fillModeLabel(mode)}`,
    description: MODE_DESCRIPTION[mode](template.name),
    robots,
  };
}

/**
 * The fill-a-template workspace: header bar with the template name, owner-only
 * publish/delete controls, an optional tag-parsing warnings banner, and the
 * {@link FillForm} split pane for `mode`. Rendered by every template route
 * under `/client/dashboard/templates/[id]` and `/public/templates/[id]` —
 * access control lives in {@link getTemplate} plus the owner-only mode check
 * below.
 */
export async function TemplateDetail({
  id,
  mode = "single",
  basePath,
  warningsParam,
}: {
  id: string;
  /** Which fill mode this route renders. Defaults to the template page itself. */
  mode?: FillMode;
  /** This audience's templates list path: `/client/dashboard/templates` or `/public/templates`. */
  basePath: string;
  warningsParam?: string;
}) {
  const [template, session] = await Promise.all([getTemplate(id), getSession()]);

  if (!template) {
    notFound();
  }

  const isOwner = isTemplateOwner(template, session?.user.id);

  // An owner-only mode is not merely hidden from the switcher: reaching its URL
  // directly must look exactly like a route that doesn't exist.
  if (isOwnerOnlyMode(mode) && !isOwner) {
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
      <AppHeader user={session?.user} />
      <div className="shrink-0 border-b border-border">
        <div className="mx-auto flex w-full max-w-[var(--content-max)] items-center justify-between gap-4 px-6 py-4">
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
                <DownloadTemplateButton templateId={template.id} />
                <PublishToggle templateId={template.id} isPublic={template.isPublic} />
                <DeleteTemplateButton
                  templateId={template.id}
                  redirectTo="/client/dashboard/templates"
                />
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
          <div className="mx-auto w-full max-w-[var(--content-max)] px-6 py-3">
            <p className="font-medium">Some tags weren&apos;t fully understood</p>
            <ul className="mt-1 list-disc list-inside space-y-0.5">
              {warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <main className="mx-auto flex w-full max-w-[var(--content-max)] flex-1 min-h-0 flex-col">
        <FillForm
          templateId={template.id}
          fields={template.fields}
          templateName={template.name}
          mode={mode}
          basePath={`${basePath}/${template.id}`}
          isOwner={isOwner}
        />
      </main>
    </div>
  );
}
