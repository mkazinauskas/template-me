import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { count, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { templates, user } from "@/db/schema";
import { auth } from "@/lib/auth";
import { Logo } from "@/components/logo";
import { SignOutButton } from "@/components/sign-out-button";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Admin",
  robots: { index: false, follow: false },
};

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

export default async function AdminPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    redirect("/sign-in");
  }
  // Non-admins get a 404, as if the route didn't exist — same treatment
  // templates get when a non-owner requests them (see db/schema.ts).
  if (session.user.role !== "admin") {
    notFound();
  }

  const db = getDb();
  const [users, templateRows] = await Promise.all([
    db
      .select({
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        createdAt: user.createdAt,
        templateCount: count(templates.id),
      })
      .from(user)
      .leftJoin(templates, eq(templates.userId, user.id))
      .groupBy(user.id)
      .orderBy(desc(user.createdAt)),
    db
      .select({
        id: templates.id,
        name: templates.name,
        originalFilename: templates.originalFilename,
        fields: templates.fields,
        createdAt: templates.createdAt,
        ownerName: user.name,
        ownerEmail: user.email,
      })
      .from(templates)
      .leftJoin(user, eq(templates.userId, user.id))
      .orderBy(desc(templates.createdAt)),
  ]);

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black">
      <main className="mx-auto max-w-6xl px-6 py-10 flex flex-col gap-10">
        <div className="flex flex-wrap items-center justify-between gap-y-2">
          <Link href="/" className="transition-transform hover:scale-[1.03]">
            <Logo size="sm" />
          </Link>
          <div className="flex items-center gap-4">
            <Link
              href="/dashboard"
              className="shrink-0 text-sm text-black/50 dark:text-white/50 hover:underline"
            >
              ← Dashboard
            </Link>
            <SignOutButton />
          </div>
        </div>

        <div className="animate-fade-in-up">
          <h1 className="text-2xl font-semibold tracking-tight">Admin</h1>
          <p className="text-sm text-black/60 dark:text-white/60 mt-1">
            All users and templates across the app.
          </p>
        </div>

        <section className="animate-fade-in-up flex flex-col gap-3" style={{ animationDelay: "0.1s" }}>
          <h2 className="text-lg font-semibold">
            Users <span className="text-black/50 dark:text-white/50 font-normal">({users.length})</span>
          </h2>
          <div className="overflow-x-auto rounded-xl border border-black/10 dark:border-white/15 bg-white dark:bg-white/[0.02]">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-black/10 dark:border-white/15 text-left text-xs text-black/50 dark:text-white/50">
                  <th className="px-4 py-2.5 font-medium">Name</th>
                  <th className="px-4 py-2.5 font-medium">Email</th>
                  <th className="px-4 py-2.5 font-medium">Role</th>
                  <th className="px-4 py-2.5 font-medium">Templates</th>
                  <th className="px-4 py-2.5 font-medium">Joined</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr
                    key={u.id}
                    className="border-b border-black/5 dark:border-white/10 last:border-0"
                  >
                    <td className="px-4 py-2.5 font-medium">{u.name}</td>
                    <td className="px-4 py-2.5 text-black/60 dark:text-white/60">{u.email}</td>
                    <td className="px-4 py-2.5">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] ${
                          u.role === "admin"
                            ? "bg-black text-white dark:bg-white dark:text-black"
                            : "bg-black/[0.04] dark:bg-white/[0.08] text-black/60 dark:text-white/60"
                        }`}
                      >
                        {u.role}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-black/60 dark:text-white/60">{u.templateCount}</td>
                    <td className="px-4 py-2.5 text-black/50 dark:text-white/50">
                      {dateFormatter.format(u.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="animate-fade-in-up flex flex-col gap-3" style={{ animationDelay: "0.2s" }}>
          <h2 className="text-lg font-semibold">
            Templates{" "}
            <span className="text-black/50 dark:text-white/50 font-normal">
              ({templateRows.length})
            </span>
          </h2>
          <div className="overflow-x-auto rounded-xl border border-black/10 dark:border-white/15 bg-white dark:bg-white/[0.02]">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-black/10 dark:border-white/15 text-left text-xs text-black/50 dark:text-white/50">
                  <th className="px-4 py-2.5 font-medium">Name</th>
                  <th className="px-4 py-2.5 font-medium">File</th>
                  <th className="px-4 py-2.5 font-medium">Owner</th>
                  <th className="px-4 py-2.5 font-medium">Fields</th>
                  <th className="px-4 py-2.5 font-medium">Created</th>
                </tr>
              </thead>
              <tbody>
                {templateRows.map((t) => (
                  <tr
                    key={t.id}
                    className="border-b border-black/5 dark:border-white/10 last:border-0"
                  >
                    <td className="px-4 py-2.5 font-medium">{t.name}</td>
                    <td className="px-4 py-2.5 text-black/60 dark:text-white/60">
                      {t.originalFilename}
                    </td>
                    <td className="px-4 py-2.5 text-black/60 dark:text-white/60">
                      {t.ownerEmail ?? <span className="text-black/50 dark:text-white/50">— none —</span>}
                    </td>
                    <td className="px-4 py-2.5 text-black/60 dark:text-white/60">
                      {t.fields.length}
                    </td>
                    <td className="px-4 py-2.5 text-black/50 dark:text-white/50">
                      {dateFormatter.format(t.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}
