import type { ReactNode } from "react";

/**
 * The generated-document preview pane shared by the single and bulk fill
 * forms: an iframe once a preview URL exists, an arbitrary `emptyState`
 * before that (a placeholder message for the single form, the editable rows
 * table for the bulk form), and a loading/error status badge overlaid in the
 * top-right corner.
 */
export function DocumentPreviewPane({
  url,
  loading,
  error,
  emptyState,
  loadingLabel = "Updating preview…",
  previewActions,
}: {
  url: string | null;
  loading: boolean;
  error: string | null;
  emptyState: ReactNode;
  loadingLabel?: string;
  /** Extra controls overlaid on top of the iframe, e.g. a "back to editing" button. */
  previewActions?: ReactNode;
}) {
  return (
    <div className="relative flex-1 min-h-[60vh] lg:min-h-0 bg-zinc-100 dark:bg-zinc-950">
      {url ? (
        <>
          {previewActions}
          <iframe src={url} title="Document preview" className="w-full h-full border-0" />
        </>
      ) : (
        emptyState
      )}

      {(loading || error) && (
        <div
          role="alert"
          className={`absolute top-3 right-3 rounded-md px-3 py-1.5 text-xs font-medium shadow-sm ${
            error ? "bg-red-600 text-white" : "bg-black/80 text-white dark:bg-white/90 dark:text-black"
          }`}
        >
          {error ?? loadingLabel}
        </div>
      )}
    </div>
  );
}
