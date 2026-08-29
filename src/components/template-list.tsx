import Link from "next/link";
import { getDb } from "@/db";
import { templates } from "@/db/schema";
import { count, desc } from "drizzle-orm";

const PAGE_SIZE = 10;

export async function TemplateList({ page = 1 }: { page?: number }) {
  const db = getDb();
  const [rows, [{ total }]] = await Promise.all([
    db
      .select()
      .from(templates)
      .orderBy(desc(templates.createdAt))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db.select({ total: count() }).from(templates),
  ]);

  if (total === 0) {
    return (
      <p className="text-sm text-black/60 dark:text-white/60">
        No templates uploaded yet.
      </p>
    );
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="flex flex-col gap-4">
      <ul className="flex flex-col gap-2">
        {rows.map((t, i) => (
          <li
            key={t.id}
            className="animate-fade-in-up"
            style={{ animationDelay: `${Math.min(i, 8) * 0.05}s` }}
          >
            <Link
              href={`/templates/${t.id}`}
              className="group flex items-center justify-between rounded-lg border border-black/10 dark:border-white/15 px-4 py-3 hover:bg-black/[0.03] dark:hover:bg-white/[0.06] hover:-translate-y-0.5 hover:shadow-md hover:shadow-black/5 dark:hover:shadow-white/5 transition-all"
            >
              <div>
                <p className="font-medium">{t.name}</p>
                <p className="text-xs text-black/50 dark:text-white/50">
                  {t.fields.length} field{t.fields.length === 1 ? "" : "s"} ·{" "}
                  {t.originalFilename}
                </p>
              </div>
              <span className="text-sm text-black/40 dark:text-white/40 transition-transform group-hover:translate-x-0.5">
                Fill in →
              </span>
            </Link>
          </li>
        ))}
      </ul>

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <Link
            href={page <= 2 ? "?" : `?page=${page - 1}`}
            aria-disabled={page <= 1}
            className={`rounded-md border border-black/10 dark:border-white/15 px-3 py-1.5 ${
              page <= 1
                ? "pointer-events-none opacity-40"
                : "hover:bg-black/[0.03] dark:hover:bg-white/[0.06]"
            }`}
          >
            ← Previous
          </Link>
          <span className="text-black/50 dark:text-white/50">
            Page {page} of {totalPages}
          </span>
          <Link
            href={`?page=${page + 1}`}
            aria-disabled={page >= totalPages}
            className={`rounded-md border border-black/10 dark:border-white/15 px-3 py-1.5 ${
              page >= totalPages
                ? "pointer-events-none opacity-40"
                : "hover:bg-black/[0.03] dark:hover:bg-white/[0.06]"
            }`}
          >
            Next →
          </Link>
        </div>
      )}
    </div>
  );
}
