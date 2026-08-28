import Link from "next/link";
import { getDb } from "@/db";
import { templates } from "@/db/schema";
import { desc } from "drizzle-orm";

export async function TemplateList() {
  const db = getDb();
  const rows = await db.select().from(templates).orderBy(desc(templates.createdAt));

  if (rows.length === 0) {
    return (
      <p className="text-sm text-black/60 dark:text-white/60">
        No templates uploaded yet.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {rows.map((t) => (
        <li key={t.id}>
          <Link
            href={`/templates/${t.id}`}
            className="flex items-center justify-between rounded-lg border border-black/10 dark:border-white/15 px-4 py-3 hover:bg-black/[0.03] dark:hover:bg-white/[0.06] transition-colors"
          >
            <div>
              <p className="font-medium">{t.name}</p>
              <p className="text-xs text-black/50 dark:text-white/50">
                {t.fields.length} field{t.fields.length === 1 ? "" : "s"} ·{" "}
                {t.originalFilename}
              </p>
            </div>
            <span className="text-sm text-black/40 dark:text-white/40">Fill in →</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
