"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const FORM_WIDTH_STORAGE_KEY = "fillFormPaneWidth";
const FORM_WIDTH_MIN = 280;
const FORM_WIDTH_MAX = 800;
const FORM_WIDTH_DEFAULT = 420;

const FORM_HEIGHT_STORAGE_KEY = "fillFormPaneHeight";
const FORM_HEIGHT_MIN = 240;
const FORM_HEIGHT_MAX = 1200;
const FORM_HEIGHT_DEFAULT = 448;

type Axis = "horizontal" | "vertical";

/**
 * Drag-to-resize a pane along one axis, persisted to localStorage and clamped
 * to [min, max]. `axis: "horizontal"` drags a side pane's width (handle on its
 * right edge); `axis: "vertical"` drags a pane's height (handle on its bottom
 * edge). The measured edge is the container's left/top, so the size always
 * tracks the pointer's distance from where the pane starts.
 */
function useResizablePane({
  axis,
  storageKey,
  min,
  max,
  defaultSize,
}: {
  axis: Axis;
  storageKey: string;
  min: number;
  max: number;
  defaultSize: number;
}) {
  const [size, setSize] = useState(defaultSize);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const isResizing = useRef(false);

  useEffect(() => {
    // Deferred to after mount (rather than a lazy useState initializer) so the
    // first client render matches the server-rendered defaultSize — reading
    // localStorage during the initial render would cause a hydration mismatch.
    const stored = Number(localStorage.getItem(storageKey));
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (stored >= min && stored <= max) setSize(stored);
  }, [storageKey, min, max]);

  const handleResizeMove = useCallback(
    (e: PointerEvent) => {
      if (!isResizing.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const next = axis === "horizontal" ? e.clientX - rect.left : e.clientY - rect.top;
      setSize(Math.min(max, Math.max(min, next)));
    },
    [axis, min, max]
  );

  const stopResizingRef = useRef<() => void>(() => {});
  const stopResizing = useCallback(() => {
    if (!isResizing.current) return;
    isResizing.current = false;
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
    setSize((current) => {
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
      document.body.style.cursor = axis === "horizontal" ? "col-resize" : "row-resize";
      document.body.style.userSelect = "none";
      // Fast drags can put the pointer over an <iframe> preview, which is a
      // separate document — plain window listeners stop receiving events
      // there. Pointer capture retargets events to this element regardless
      // of what's underneath, so the drag keeps tracking.
      e.currentTarget.setPointerCapture(e.pointerId);
      window.addEventListener("pointermove", handleResizeMove);
      window.addEventListener("pointerup", stopResizing);
    },
    [axis, handleResizeMove, stopResizing]
  );

  useEffect(() => {
    return () => {
      window.removeEventListener("pointermove", handleResizeMove);
      window.removeEventListener("pointerup", stopResizing);
    };
  }, [handleResizeMove, stopResizing]);

  const resetSize = useCallback(() => {
    setSize(defaultSize);
    localStorage.setItem(storageKey, String(defaultSize));
  }, [defaultSize, storageKey]);

  return { size, containerRef, startResizing, resetSize };
}

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
  const { size, containerRef, startResizing, resetSize } = useResizablePane({
    axis: "horizontal",
    storageKey,
    min,
    max,
    defaultSize: defaultWidth,
  });

  return { width: size, containerRef, startResizing, resetWidth: resetSize };
}

/** Drag-to-resize a pane's height, persisted to localStorage and clamped to [min, max]. */
export function useResizablePaneHeight({
  storageKey = FORM_HEIGHT_STORAGE_KEY,
  min = FORM_HEIGHT_MIN,
  max = FORM_HEIGHT_MAX,
  defaultHeight = FORM_HEIGHT_DEFAULT,
}: {
  storageKey?: string;
  min?: number;
  max?: number;
  defaultHeight?: number;
} = {}) {
  const { size, containerRef, startResizing, resetSize } = useResizablePane({
    axis: "vertical",
    storageKey,
    min,
    max,
    defaultSize: defaultHeight,
  });

  return { height: size, containerRef, startResizing, resetHeight: resetSize };
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

/**
 * The height counterpart of `ResizeHandle`: a full-width grip under a pane,
 * dragged up and down. Double-click resets to the default height.
 */
export function VerticalResizeHandle({
  onPointerDown,
  onReset,
  label = "Resize preview height",
}: {
  onPointerDown: (e: React.PointerEvent) => void;
  onReset: () => void;
  label?: string;
}) {
  return (
    <div
      role="separator"
      aria-orientation="horizontal"
      aria-label={label}
      onPointerDown={onPointerDown}
      onDoubleClick={onReset}
      className="flex h-3 shrink-0 cursor-row-resize items-center justify-center touch-none group"
    >
      <div className="h-px w-full bg-black/10 dark:bg-white/15 group-hover:bg-black/30 dark:group-hover:bg-white/40 group-active:bg-black/50 dark:group-active:bg-white/60 transition-colors" />
    </div>
  );
}
