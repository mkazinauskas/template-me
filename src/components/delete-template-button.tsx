"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function DeleteTemplateButton({
  templateId,
  variant = "text",
  redirectTo = "/dashboard",
}: {
  templateId: string;
  variant?: "text" | "icon";
  redirectTo?: string | null;
}) {
  const router = useRouter();
  const [isDeleting, setIsDeleting] = useState(false);

  async function handleDelete() {
    if (!confirm("Delete this template? This cannot be undone.")) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/templates/${templateId}`, { method: "DELETE" });
      if (res.ok) {
        if (redirectTo) router.push(redirectTo);
        router.refresh();
      }
    } finally {
      setIsDeleting(false);
    }
  }

  if (variant === "icon") {
    return (
      <button
        onClick={handleDelete}
        disabled={isDeleting}
        aria-label={isDeleting ? "Deleting…" : "Delete template"}
        title="Delete template"
        className="rounded-md p-1.5 text-black/30 dark:text-white/30 hover:bg-red-600/10 hover:text-red-600 dark:hover:text-red-400 disabled:opacity-50 transition-colors"
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="size-4">
          <path
            fillRule="evenodd"
            d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z"
            clipRule="evenodd"
          />
        </svg>
      </button>
    );
  }

  return (
    <button
      onClick={handleDelete}
      disabled={isDeleting}
      className="text-sm text-red-600 dark:text-red-400 hover:underline disabled:opacity-50"
    >
      {isDeleting ? "Deleting…" : "Delete"}
    </button>
  );
}
