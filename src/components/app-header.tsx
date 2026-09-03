"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Logo } from "@/components/logo";
import { authClient } from "@/lib/auth-client";

type HeaderUser = { email: string; role?: string | null };

/**
 * The single top-of-page navigation for every app screen (client dashboard,
 * browse, admin, fill). Previously each page hand-rolled its own row of faint
 * links that differed page to page; this centralises them into one bar with a
 * clear primary nav and an account menu. The "Templates" link points at the
 * signed-in browse (`/client/dashboard/templates`) or the public one
 * (`/public/templates`) depending on whether a `user` is passed.
 */
export function AppHeader({
  user,
  width = "page",
}: {
  user?: HeaderUser | null;
  /**
   * `page` — the standard app content width (`max-w-6xl`), matching every
   * stacked page (dashboard, browse, admin). `full` — edge-to-edge, for the
   * `templates/[id]` workspace whose body is a full-bleed split pane.
   */
  width?: "page" | "full";
}) {
  const pathname = usePathname();

  const templatesHref = user ? "/client/dashboard/templates" : "/public/templates";
  const navItems = [
    {
      href: "/client/dashboard",
      label: "Upload",
      match: (p: string) => p === "/client/dashboard",
    },
    {
      href: templatesHref,
      label: "Templates",
      match: (p: string) =>
        p.startsWith("/client/dashboard/templates") || p.startsWith("/public/templates"),
    },
    ...(user?.role === "admin"
      ? [{ href: "/admin/dashboard", label: "Admin", match: (p: string) => p.startsWith("/admin") }]
      : []),
  ];

  return (
    <header className="sticky top-0 z-30 shrink-0 border-b border-border bg-zinc-50/80 dark:bg-black/80 backdrop-blur-md">
      <div
        className={`mx-auto flex h-14 items-center justify-between gap-4 px-6 ${
          width === "full" ? "max-w-none" : "max-w-[var(--content-max)]"
        }`}
      >
        <div className="flex items-center gap-1 sm:gap-3">
          <Link
            href="/"
            aria-label="Template Me home"
            className="mr-1 transition-transform hover:scale-[1.03]"
          >
            <Logo size="sm" animated={false} />
          </Link>
          <nav aria-label="Primary" className="flex items-center gap-1">
            {navItems.map((item) => {
              const active = item.match(pathname);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={`rounded-lg px-2.5 py-1.5 text-sm transition-colors ${
                    active
                      ? "bg-black/[0.06] font-medium text-foreground dark:bg-white/[0.1]"
                      : "text-muted-foreground hover:bg-black/[0.03] hover:text-foreground dark:hover:bg-white/[0.06]"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>

        {user ? (
          <AccountMenu user={user} />
        ) : (
          <Link
            href="/sign-in"
            className="rounded-lg px-2.5 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            Sign in
          </Link>
        )}
      </div>
    </header>
  );
}

function AccountMenu({ user }: { user: HeaderUser }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  async function handleSignOut() {
    setSigningOut(true);
    await authClient.signOut();
    router.push("/");
    router.refresh();
  }

  const initial = user.email.charAt(0).toUpperCase();

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-2 rounded-full border border-border bg-white py-1 pl-1 pr-2.5 text-sm transition-colors hover:bg-black/[0.03] dark:bg-white/[0.03] dark:hover:bg-white/[0.06]"
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-black text-xs font-semibold text-white dark:bg-white dark:text-black">
          {initial}
        </span>
        <span className="hidden max-w-[10rem] truncate text-muted-foreground sm:block">
          {user.email}
        </span>
        <svg
          viewBox="0 0 12 12"
          className={`h-3 w-3 shrink-0 text-muted-foreground transition-transform ${
            open ? "rotate-180" : ""
          }`}
          aria-hidden="true"
        >
          <path
            d="M3 4.5 6 7.5 9 4.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 mt-2 w-60 overflow-hidden rounded-xl border border-border bg-white shadow-lg shadow-black/5 dark:bg-zinc-950 dark:shadow-black/40"
        >
          <div className="px-3 py-2.5">
            <p className="text-xs text-muted-foreground">Signed in as</p>
            <p className="truncate text-sm font-medium">{user.email}</p>
          </div>
          <div className="h-px bg-border" />
          <Link
            href="/"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="block px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-black/[0.03] hover:text-foreground dark:hover:bg-white/[0.06]"
          >
            Back to home
          </Link>
          <button
            type="button"
            role="menuitem"
            onClick={handleSignOut}
            disabled={signingOut}
            className="block w-full px-3 py-2 text-left text-sm text-red-600 transition-colors hover:bg-red-500/[0.08] disabled:opacity-50 dark:text-red-400"
          >
            {signingOut ? "Signing out…" : "Sign out"}
          </button>
        </div>
      )}
    </div>
  );
}
