import Link from "next/link";
import { headers } from "next/headers";
import { getDb } from "@/db";
import { templates } from "@/db/schema";
import type { TemplateFieldType } from "@/db/schema";
import { and, count, desc, eq, ilike, ne, or, type SQL } from "drizzle-orm";
import { DeleteTemplateButton } from "@/components/delete-template-button";
import { buttonClasses } from "@/components/ui/button";
import { auth } from "@/lib/auth";

const PAGE_SIZE = 12;

const TYPE_META: Record<TemplateFieldType, { label: string; dot: string }> = {
  string: { label: "Text", dot: "bg-sky-500" },
  number: { label: "Number", dot: "bg-violet-500" },
  date: { label: "Date", dot: "bg-amber-500" },
  boolean: { label: "Toggle", dot: "bg-emerald-500" },
  select: { label: "Select", dot: "bg-pink-500" },
  checkbox: { label: "Checkbox", dot: "bg-teal-500" },
  textarea: { label: "Textarea", dot: "bg-indigo-500" },
  email: { label: "Email", dot: "bg-cyan-500" },
  url: { label: "URL", dot: "bg-blue-500" },
  currency: { label: "Currency", dot: "bg-lime-500" },
};

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

export async function TemplateList({
  page = 1,
  q,
  scope = "own",
  pageParam = "page",
  preview,
  hrefBase,
}: {
  page?: number;
  q?: string;
  /** "own" = the caller's own templates; "public" = public templates from other users. */
  scope?: "own" | "public";
  /** Query-param name for this list's pagination, so two lists on one page don't collide. */
  pageParam?: string;
  /**
   * Path prefix for each card's "Open" link — the audience-specific templates
   * route. `/client/dashboard/templates` for the signed-in pages,
   * `/public/templates` for the logged-out browse.
   */
  hrefBase: string;
  /**
   * Logged-out preview mode: cap the grid at `limit` rows, drop pagination, and
   * render a sign-in call-to-action underneath (with a count of the templates
   * that stay locked behind an account).
   */
  preview?: { limit: number };
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (scope === "own" && !session) {
    return (
      <p className="text-sm text-muted-foreground">
        Sign in to see your templates.
      </p>
    );
  }

  const db = getDb();
  const term = q?.trim();
  const scopeFilter =
    scope === "own"
      ? eq(templates.userId, session!.user.id)
      : and(
          eq(templates.isPublic, true),
          session ? ne(templates.userId, session.user.id) : undefined
        );
  const termFilter = term
    ? or(ilike(templates.name, `%${term}%`), ilike(templates.originalFilename, `%${term}%`))
    : undefined;
  const where = (termFilter ? and(scopeFilter, termFilter) : scopeFilter) as SQL;

  const pageSize = preview ? preview.limit : PAGE_SIZE;
  const offset = preview ? 0 : (page - 1) * PAGE_SIZE;

  const [rows, [{ total }]] = await Promise.all([
    db
      .select()
      .from(templates)
      .where(where)
      .orderBy(desc(templates.createdAt))
      .limit(pageSize)
      .offset(offset),
    db.select({ total: count() }).from(templates).where(where),
  ]);

  if (total === 0) {
    const emptyLabel = scope === "public" ? "public templates" : "templates";
    const message = term
      ? `No ${emptyLabel} match "${term}".`
      : scope === "public"
        ? "No public templates yet."
        : "No templates uploaded yet.";
    return (
      <div className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">{message}</p>
        {preview && <SignInGate locked={0} />}
      </div>
    );
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const qParam = term ? `q=${encodeURIComponent(term)}&` : "";

  return (
    <div className="flex flex-col gap-4">
      <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {rows.map((t, i) => {
          const typeCounts = new Map<TemplateFieldType, number>();
          const groupLabels = new Set<string>();
          for (const field of t.fields) {
            typeCounts.set(field.type, (typeCounts.get(field.type) ?? 0) + 1);
            if (field.groupLabel) groupLabels.add(field.groupLabel);
          }

          return (
            <li
              key={t.id}
              className="animate-fade-in-up"
              style={{ animationDelay: `${Math.min(i, 8) * 0.05}s` }}
            >
              <div className="group relative flex h-full flex-col gap-3 rounded-xl border border-border bg-white dark:bg-white/[0.02] p-5 transition-all hover:-translate-y-1 hover:shadow-lg hover:shadow-black/5 dark:hover:shadow-white/5">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-black/[0.04] dark:bg-white/[0.08]">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                      className="size-4 text-muted-foreground"
                      aria-hidden="true"
                    >
                      <path
                        fillRule="evenodd"
                        d="M4 2a2 2 0 00-2 2v12a2 2 0 002 2h12a2 2 0 002-2V7.914a2 2 0 00-.586-1.414l-3.914-3.914A2 2 0 0012.086 2H4zm2 9a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </div>
                  <div className="relative z-10 flex items-center gap-1.5">
                    {t.isPublic && (
                      <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
                        Public
                      </span>
                    )}
                    {scope === "own" && (
                      <DeleteTemplateButton
                        templateId={t.id}
                        variant="icon"
                        redirectTo={null}
                      />
                    )}
                  </div>
                </div>

                <div className="min-w-0">
                  <h3 className="truncate font-semibold" title={t.name}>
                    {t.name}
                  </h3>
                  <p
                    className="truncate text-xs text-muted-foreground"
                    title={t.originalFilename}
                  >
                    {t.originalFilename}
                  </p>
                </div>

                {t.fields.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {[...typeCounts.entries()].map(([type, n]) => (
                      <span
                        key={type}
                        className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground"
                      >
                        <span className={`size-1.5 rounded-full ${TYPE_META[type].dot}`} aria-hidden="true" />
                        {n} {TYPE_META[type].label}
                        {n === 1 ? "" : "s"}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-[11px] text-muted-foreground">No fields detected</p>
                )}

                {groupLabels.size > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {[...groupLabels].map((label) => (
                      <span
                        key={label}
                        className="rounded-full bg-black/[0.04] dark:bg-white/[0.08] px-2 py-0.5 text-[11px] text-muted-foreground"
                      >
                        {label}
                      </span>
                    ))}
                  </div>
                )}

                <div className="mt-auto flex items-center justify-between gap-2 pt-3 border-t border-black/5 dark:border-white/10">
                  <span className="text-xs text-muted-foreground">
                    {dateFormatter.format(t.createdAt)}
                  </span>
                  <Link
                    href={`${hrefBase}/${t.id}`}
                    className="inline-flex items-center gap-1 text-sm font-medium text-black dark:text-white after:content-['→'] after:transition-transform after:duration-200 group-hover:after:translate-x-0.5 before:absolute before:inset-0 before:z-0 before:content-['']"
                    aria-label={`Open ${t.name}`}
                  >
                    Open
                  </Link>
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      {preview ? (
        <SignInGate locked={Math.max(0, total - preview.limit)} />
      ) : (
        totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <Link
            href={page <= 2 ? `?${qParam}` : `?${qParam}${pageParam}=${page - 1}`}
            aria-disabled={page <= 1}
            className={`rounded-md border border-border px-3 py-1.5 ${
              page <= 1
                ? "pointer-events-none opacity-40"
                : "hover:bg-black/[0.03] dark:hover:bg-white/[0.06]"
            }`}
          >
            ← Previous
          </Link>
          <span className="text-muted-foreground">
            Page {page} of {totalPages}
          </span>
          <Link
            href={`?${qParam}${pageParam}=${page + 1}`}
            aria-disabled={page >= totalPages}
            className={`rounded-md border border-border px-3 py-1.5 ${
              page >= totalPages
                ? "pointer-events-none opacity-40"
                : "hover:bg-black/[0.03] dark:hover:bg-white/[0.06]"
            }`}
          >
            Next →
          </Link>
        </div>
        )
      )}
    </div>
  );
}

/**
 * Call-to-action shown under the logged-out public-template preview. When
 * `locked > 0` it names how many more public templates an account unlocks;
 * otherwise it simply nudges the visitor to sign in and upload their own.
 */
function SignInGate({ locked }: { locked: number }) {
  return (
    <div className="animate-fade-in-up flex flex-col items-center gap-4 rounded-xl border border-dashed border-border bg-white p-6 text-center sm:flex-row sm:justify-between sm:text-left dark:bg-white/[0.02]">
      <div className="flex items-center gap-3">
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-black/[0.04] dark:bg-white/[0.08]"
          aria-hidden="true"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            className="size-4 text-muted-foreground"
          >
            <path
              fillRule="evenodd"
              d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1zm3 8V5.5a3 3 0 10-6 0V9h6z"
              clipRule="evenodd"
            />
          </svg>
        </div>
        <div>
          <p className="font-semibold">
            {locked > 0
              ? `${locked} more ${locked === 1 ? "template" : "templates"} with a free account`
              : "Upload and manage your own templates"}
          </p>
          <p className="text-sm text-muted-foreground">
            Sign in to browse every public template and publish your own .docx files.
          </p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Link
          href="/sign-in?redirect=/public/templates"
          className={buttonClasses({ interactive: "hover" })}
        >
          Sign in
        </Link>
        <Link
          href="/sign-up?redirect=/public/templates"
          className={buttonClasses({ variant: "secondary", interactive: "hover" })}
        >
          Create account
        </Link>
      </div>
    </div>
  );
}
