import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { templates } from "@/db/schema";
import { FillForm } from "@/components/fill-form";
import { DeleteTemplateButton } from "@/components/delete-template-button";

export default async function TemplatePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const db = getDb();
  const [template] = await db.select().from(templates).where(eq(templates.id, id));

  if (!template) {
    notFound();
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black">
      <main className="mx-auto max-w-3xl px-6 py-16 flex flex-col gap-8">
        <div>
          <Link
            href="/"
            className="text-sm text-black/50 dark:text-white/50 hover:underline"
          >
            ← All templates
          </Link>
          <div className="flex items-center justify-between mt-2">
            <h1 className="text-2xl font-semibold tracking-tight">{template.name}</h1>
            <DeleteTemplateButton templateId={template.id} />
          </div>
          <p className="text-sm text-black/60 dark:text-white/60 mt-1">
            {template.originalFilename}
          </p>
        </div>

        <div className="rounded-xl border border-black/10 dark:border-white/15 p-6">
          <FillForm
            templateId={template.id}
            fields={template.fields}
            templateName={template.name}
          />
        </div>
      </main>
    </div>
  );
}
