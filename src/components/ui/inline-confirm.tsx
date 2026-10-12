"use client";

import { useState } from "react";

/**
 * A destructive action that confirms in place: the trigger swaps itself for a
 * "Confirm / Cancel" pair, which collapses again once the action settles, is
 * cancelled, or loses focus. Owns both the confirming and in-flight state so
 * every row doesn't have to carry its own copy — `onConfirm` just does the
 * work and may throw, leaving the row free to render the error however it
 * wants.
 */
export function InlineConfirm({
  label,
  pendingLabel,
  onConfirm,
}: {
  label: string;
  pendingLabel: string;
  onConfirm: () => Promise<void>;
}) {
  const [isConfirming, setIsConfirming] = useState(false);
  const [isPending, setIsPending] = useState(false);

  async function handleConfirm() {
    setIsPending(true);
    try {
      await onConfirm();
    } finally {
      setIsPending(false);
      setIsConfirming(false);
    }
  }

  if (!isConfirming) {
    return (
      <button
        type="button"
        onClick={() => setIsConfirming(true)}
        className="text-sm text-red-600 dark:text-red-400 hover:underline"
      >
        {label}
      </button>
    );
  }

  return (
    <span
      className="inline-flex items-center gap-2 text-sm"
      onBlur={(e) => {
        if (!isPending && !e.currentTarget.contains(e.relatedTarget)) setIsConfirming(false);
      }}
    >
      <button
        type="button"
        autoFocus
        onClick={handleConfirm}
        disabled={isPending}
        className="text-red-600 dark:text-red-400 hover:underline disabled:opacity-50"
      >
        {isPending ? pendingLabel : "Confirm"}
      </button>
      <button
        type="button"
        onClick={() => setIsConfirming(false)}
        disabled={isPending}
        className="text-muted-foreground hover:underline disabled:opacity-50"
      >
        Cancel
      </button>
    </span>
  );
}
