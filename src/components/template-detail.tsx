import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { cache } from "react";
import { getDb } from "@/db";
import { templates } from "@/db/schema";
import { auth } from "@/lib/auth";
import { canViewTemplate, isTemplateOwner } from "@/lib/template-access";
import { FillForm } from "@/components/fill-form";
import { DeleteTemplateButton } from "@/components/delete-template-button";
import { DownloadTemplateButton } from "@/components/download-template-button";
import { PublishToggle } from "@/components/publish-toggle";
import { AppHeader } from "@/components/app-header";

const getSession = cache(async () =>
  auth.api.getSession({ headers: await headers() })
);

/**
 * Fetch a template by id, enforcing {@link canViewTemplate} (owner, or the
 * template is public). Shared by the two route entry points
 * (`/client/dashboard/templates/[id]` and `/public/templates/[id]`) and their
 * `generateMetadata`, so the DB hit is de-duplicated per request.
 */
export const getTemplate = cache(async (id: string) => {
  const session = await getSession();
  const db = getDb();
  const [template] = await db.select().from(templates).where(eq(templates.id, id));
  if (!template || !canViewTemplate(template, session?.user.id)) return undefined;
  return template;
});

/**
 * The fill-a-template workspace: header bar with the template name, owner-only
 * publish/delete controls, an optional tag-parsing warnings banner, and the
 * {@link FillForm} split pane. Rendered by both the signed-in
 * (`/client/dashboard/templates/[id]`) and public (`/public/templates/[id]`)
 * route files — access control lives entirely in {@link getTemplate}.
 */
export async function TemplateDetail({
  id,
  warningsParam,
}: {
  id: string;
  warningsParam?: string;
}) {
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
        />
      </main>
    </div>
  );
}
