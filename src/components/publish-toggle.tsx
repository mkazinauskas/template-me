"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const EXPLAINER =
  "When public, this template is accessible to others — anyone with the link can find, fill in, and download it.";

/**
 * Owner-only switch on the template page that flips a template between private
 * and public. A public template can be found, opened, filled in, and downloaded
 * by anyone — signed in or not. PATCHes /api/templates/[id] then refreshes so
 * the server-rendered badge/sections update.
 *
 * Making a template public exposes it to everyone, so that direction goes
 * through a non-blocking inline confirm step (same pattern as the delete
 * button). Making it private again is safe and applies immediately.
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
  const [isConfirming, setIsConfirming] = useState(false);

  async function setPublic(next: boolean) {
    setPending(true);
    setError(false);
    try {
      const res = await fetch(`/api/templates/${templateId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isPublic: next }),
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
      setIsConfirming(false);
    }
  }

  function onToggle() {
    if (isPublic) {
      setPublic(false);
    } else {
      setError(false);
      setIsConfirming(true);
    }
  }

  // A native confirm() blocks the main thread while open and the browser bills
  // that span to the click handler (a ~1s INP). Use an inline confirm instead.
  if (isConfirming) {
    return (
      <div
        className="flex max-w-xs flex-col items-end gap-1.5 text-right"
        onBlur={(e) => {
          if (!pending && !e.currentTarget.contains(e.relatedTarget)) setIsConfirming(false);
        }}
      >
        <p className="text-xs text-muted-foreground">{EXPLAINER}</p>
        <span className="inline-flex items-center gap-3 text-sm">
          <button
            type="button"
            autoFocus
            onClick={() => setPublic(true)}
            disabled={pending}
            className="font-medium text-emerald-600 dark:text-emerald-400 hover:underline disabled:opacity-50"
          >
            {pending ? "Making public…" : "Make public"}
          </button>
          <button
            type="button"
            onClick={() => setIsConfirming(false)}
            disabled={pending}
            className="text-muted-foreground hover:underline disabled:opacity-50"
          >
            Cancel
          </button>
        </span>
      </div>
    );
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
          title={EXPLAINER}
          onClick={onToggle}
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
      {isPublic && (
        <p className="max-w-xs text-right text-xs text-muted-foreground">
          Accessible to others — anyone with the link can fill this in.
        </p>
      )}
      {error && (
        <p className="text-xs text-red-600 dark:text-red-400">Couldn&apos;t update. Try again.</p>
      )}
    </div>
  );
}
