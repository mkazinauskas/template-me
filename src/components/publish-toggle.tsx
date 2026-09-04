"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { orpc } from "@/lib/orpc";

const EXPLAINER =
  "When public, this template is accessible to others — anyone with the link can find, fill in, and download it.";

/**
 * Owner-only switch on the template page that flips a template between private
 * and public. A public template can be found, opened, filled in, and downloaded
 * by anyone — signed in or not. PATCHes /api/templates/[id] then refreshes so
 * the server-rendered badge/sections update.
 *
 * Sits next to the delete button in the header and mirrors its interaction:
 * making a template public is consequential, so it goes through the same
 * non-blocking inline confirm step (Confirm / Cancel). Making it private again
 * is safe and applies immediately.
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
      await orpc.templates.setPublic({ id: templateId, isPublic: next });
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
  // that span to the click handler (a ~1s INP). Use an inline confirm instead —
  // same pattern and markup as DeleteTemplateButton.
  if (isConfirming) {
    return (
      <span
        className="inline-flex items-center gap-2 text-sm"
        onBlur={(e) => {
          if (!pending && !e.currentTarget.contains(e.relatedTarget)) setIsConfirming(false);
        }}
      >
        <span className="hidden text-muted-foreground sm:inline">
          Make this template public?
        </span>
        <button
          type="button"
          autoFocus
          onClick={() => setPublic(true)}
          disabled={pending}
          title={EXPLAINER}
          className="font-medium text-emerald-600 dark:text-emerald-400 hover:underline disabled:opacity-50"
        >
          {pending ? "Publishing…" : "Confirm — make public"}
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
    );
  }

  if (error) {
    return (
      <button
        type="button"
        onClick={onToggle}
        className="text-sm text-red-600 dark:text-red-400 hover:underline"
      >
        Couldn&apos;t update — retry
      </button>
    );
  }

  return (
    <label className="inline-flex cursor-pointer select-none items-center gap-2 text-sm">
      <span className={isPublic ? "font-medium" : "text-muted-foreground"}>
        {pending ? "Saving…" : isPublic ? "Public" : "Make public"}
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
          className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform dark:bg-black ${
            isPublic ? "translate-x-4.5" : "translate-x-0.5"
          }`}
        />
      </button>
    </label>
  );
}
