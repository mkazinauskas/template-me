"use client";

import { useState } from "react";
import { orpc, orpcErrorMessage } from "@/lib/orpc";
import { downloadBlob } from "@/lib/download";

/**
 * Downloads the raw, unfilled `.docx` behind a template. Sits next to the
 * publish/delete controls on the template page — the API (`templates.download`)
 * already allows anyone who can view the template (owner, or a public viewer),
 * this just wires the client up to it.
 */
export function DownloadTemplateButton({ templateId }: { templateId: string }) {
  const [isDownloading, setIsDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDownload() {
    setIsDownloading(true);
    setError(null);
    try {
      const file = await orpc.templates.download({ id: templateId });
      downloadBlob(file, file.name);
    } catch (err) {
      setError(orpcErrorMessage(err, "Failed to download template"));
    } finally {
      setIsDownloading(false);
    }
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={handleDownload}
        disabled={isDownloading}
        className="text-sm text-muted-foreground hover:underline disabled:opacity-50"
      >
        {isDownloading ? "Downloading…" : "Download original"}
      </button>
      {error && (
        <span role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </span>
      )}
    </span>
  );
}
