import { useEffect, useRef, useState } from "react";

const PREVIEW_DEBOUNCE_MS = 700;
const PREVIEW_DEBOUNCE_MS_FIRST = 150;

/**
 * Re-renders the document preview whenever `values` change, debounced so a burst
 * of keystrokes triggers just one request. The first preview after mount uses a
 * much shorter delay so the pane fills in quickly. In-flight requests are
 * aborted when superseded, and the last blob URL is revoked on unmount.
 */
export function useLivePreview(templateId: string, values: Record<string, string>) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const previewUrlRef = useRef<string | null>(null);
  const isFirstPreview = useRef(true);

  useEffect(() => {
    previewUrlRef.current = previewUrl;
  }, [previewUrl]);

  useEffect(() => {
    return () => {
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const delay = isFirstPreview.current ? PREVIEW_DEBOUNCE_MS_FIRST : PREVIEW_DEBOUNCE_MS;
    isFirstPreview.current = false;

    const timer = setTimeout(async () => {
      setIsPreviewLoading(true);
      try {
        const res = await fetch(`/api/templates/${templateId}/generate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ data: values, preview: true }),
          signal: controller.signal,
        });

        if (!res.ok) {
          const json = await res.json().catch(() => ({}));
          setPreviewError(json.error ?? "Failed to update preview");
          return;
        }

        const url = URL.createObjectURL(await res.blob());
        setPreviewUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return url;
        });
        setPreviewError(null);
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          setPreviewError("Failed to update preview");
        }
      } finally {
        setIsPreviewLoading(false);
      }
    }, delay);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [values, templateId]);

  return { previewUrl, isPreviewLoading, previewError };
}
