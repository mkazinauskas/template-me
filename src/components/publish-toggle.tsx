"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * Owner-only switch on the template page that flips a template between private
 * and public. A public template can be found, opened, filled in, and downloaded
 * by anyone — signed in or not. PATCHes /api/templates/[id] then refreshes so
 * the server-rendered badge/sections update.
 */
export function PublishToggle({
  templateId,
  isPublic,
}: {
  templateId: string;
  isPublic: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);

  async function toggle() {
    setPending(true);
    setError(false);
    try {
      const res = await fetch(`/api/templates/${templateId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isPublic: !isPublic }),
      });
      if (!res.ok) {
        setError(true);
        return;
      }
      router.refresh();
    } catch {
      setError(true);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={toggle}
        disabled={pending}
        aria-pressed={isPublic}
        className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors disabled:opacity-50 ${
          isPublic
            ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/15"
            : "border-border text-muted-foreground hover:bg-black/[0.03] dark:hover:bg-white/[0.06]"
        }`}
      >
        <span
          aria-hidden="true"
          className={`h-2 w-2 rounded-full ${isPublic ? "bg-emerald-500" : "bg-black/30 dark:bg-white/30"}`}
        />
        {pending
          ? "Saving…"
          : isPublic
            ? "Public · anyone with the link can fill this"
            : "Private · make public"}
      </button>
      {error && (
        <p className="text-xs text-red-600 dark:text-red-400">Couldn&apos;t update. Try again.</p>
      )}
    </div>
  );
}
