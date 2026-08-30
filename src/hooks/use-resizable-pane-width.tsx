"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export const FORM_WIDTH_STORAGE_KEY = "fillFormPaneWidth";
export const FORM_WIDTH_MIN = 280;
export const FORM_WIDTH_MAX = 800;
export const FORM_WIDTH_DEFAULT = 420;

/** Drag-to-resize a side pane's width, persisted to localStorage and clamped to [min, max]. */
export function useResizablePaneWidth({
  storageKey = FORM_WIDTH_STORAGE_KEY,
  min = FORM_WIDTH_MIN,
  max = FORM_WIDTH_MAX,
  defaultWidth = FORM_WIDTH_DEFAULT,
}: {
  storageKey?: string;
  min?: number;
  max?: number;
  defaultWidth?: number;
} = {}) {
  const [width, setWidth] = useState(defaultWidth);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const isResizing = useRef(false);

  useEffect(() => {
    // Deferred to after mount (rather than a lazy useState initializer) so the
    // first client render matches the server-rendered defaultWidth — reading
    // localStorage during the initial render would cause a hydration mismatch.
    const stored = Number(localStorage.getItem(storageKey));
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (stored >= min && stored <= max) setWidth(stored);
  }, [storageKey, min, max]);

  const handleResizeMove = useCallback(
    (e: PointerEvent) => {
      if (!isResizing.current || !containerRef.current) return;
      const left = containerRef.current.getBoundingClientRect().left;
      setWidth(Math.min(max, Math.max(min, e.clientX - left)));
    },
    [min, max]
  );

  const stopResizingRef = useRef<() => void>(() => {});
  const stopResizing = useCallback(() => {
    if (!isResizing.current) return;
    isResizing.current = false;
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
    setWidth((current) => {
      localStorage.setItem(storageKey, String(current));
      return current;
    });
    window.removeEventListener("pointermove", handleResizeMove);
    window.removeEventListener("pointerup", stopResizingRef.current);
  }, [handleResizeMove, storageKey]);
  useEffect(() => {
    stopResizingRef.current = stopResizing;
  }, [stopResizing]);

  const startResizing = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      isResizing.current = true;
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
      // Fast drags can put the pointer over an <iframe> preview, which is a
      // separate document — plain window listeners stop receiving events
      // there. Pointer capture retargets events to this element regardless
      // of what's underneath, so the drag keeps tracking.
      e.currentTarget.setPointerCapture(e.pointerId);
      window.addEventListener("pointermove", handleResizeMove);
      window.addEventListener("pointerup", stopResizing);
    },
    [handleResizeMove, stopResizing]
  );

  useEffect(() => {
    return () => {
      window.removeEventListener("pointermove", handleResizeMove);
      window.removeEventListener("pointerup", stopResizing);
    };
  }, [handleResizeMove, stopResizing]);

  const resetWidth = useCallback(() => {
    setWidth(defaultWidth);
    localStorage.setItem(storageKey, String(defaultWidth));
  }, [defaultWidth, storageKey]);

  return { width, containerRef, startResizing, resetWidth };
}

export function ResizeHandle({
  onPointerDown,
  onReset,
}: {
  onPointerDown: (e: React.PointerEvent) => void;
  onReset: () => void;
}) {
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize form panel"
      onPointerDown={onPointerDown}
      onDoubleClick={onReset}
      className="hidden lg:flex w-2 shrink-0 cursor-col-resize items-center justify-center touch-none group"
    >
      <div className="h-full w-px bg-black/10 dark:bg-white/15 group-hover:bg-black/30 dark:group-hover:bg-white/40 group-active:bg-black/50 dark:group-active:bg-white/60 transition-colors" />
    </div>
  );
}
