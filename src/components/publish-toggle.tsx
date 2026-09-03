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
      <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
        <span className={isPublic ? "font-medium" : "text-muted-foreground"}>
          {pending ? "Saving…" : "Make public"}
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={isPublic}
          aria-label="Make template public"
          onClick={toggle}
          disabled={pending}
          className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-black/30 dark:focus-visible:ring-white/40 disabled:opacity-50 ${
            isPublic ? "bg-emerald-500" : "bg-black/20 dark:bg-white/20"
          }`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white dark:bg-black shadow transition-transform ${
              isPublic ? "translate-x-4.5" : "translate-x-0.5"
            }`}
          />
        </button>
      </label>
      <p className="max-w-xs text-right text-xs text-muted-foreground">
        {isPublic
          ? "This template is accessible to others — anyone with the link can find, fill in, and download it."
          : "When public, this template will be accessible to others — anyone with the link can find, fill in, and download it."}
      </p>
      {error && (
        <p className="text-xs text-red-600 dark:text-red-400">Couldn&apos;t update. Try again.</p>
      )}
    </div>
  );
}
