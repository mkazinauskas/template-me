import { useEffect, useRef, useState } from "react";
import { orpc, orpcErrorMessage } from "@/lib/orpc";

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
        const file = await orpc.templates.generate(
          { id: templateId, data: values, preview: true },
          { signal: controller.signal }
        );

        const url = URL.createObjectURL(file);
        setPreviewUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return url;
        });
        setPreviewError(null);
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          setPreviewError(orpcErrorMessage(err, "Failed to update preview"));
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
