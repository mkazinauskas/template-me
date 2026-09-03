"use client";

import { useSyncExternalStore } from "react";
import { WIDTH_STORAGE_KEY, type WidthMode } from "@/lib/width";

const labels: Record<WidthMode, string> = {
  page: "Centred",
  full: "Full width",
};

function applyWidth(mode: WidthMode) {
  document.documentElement.dataset.width = mode;
}

// Minimal external store so the button reflects the persisted choice without a
// setState-in-effect (and stays in sync across tabs via the `storage` event).
const listeners = new Set<() => void>();

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

function getSnapshot(): WidthMode {
  return localStorage.getItem(WIDTH_STORAGE_KEY) === "full" ? "full" : "page";
}

// The pre-paint script has already set `data-width`; the server has no way to
// know the stored choice, so it renders the default "page" affordance.
const getServerSnapshot = (): WidthMode => "page";

function setWidth(mode: WidthMode) {
  localStorage.setItem(WIDTH_STORAGE_KEY, mode);
  applyWidth(mode);
  listeners.forEach((l) => l());
}

/**
 * A low-key control pinned to the bottom-right corner, next to the theme
 * toggle, that switches the app's content column between the centred `max-w`
 * layout and an edge-to-edge full-width view, persisting the choice to
 * localStorage. Rendered once, globally, from the root layout.
 */
export function WidthToggle() {
  const mode = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  function toggle() {
    // Read the live snapshot rather than the render-closure `mode` so quick
    // successive clicks (before React re-renders) still flip correctly.
    setWidth(getSnapshot() === "full" ? "page" : "full");
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={`Layout: ${labels[mode]}. Click to change.`}
      aria-pressed={mode === "full"}
      title={`Layout: ${labels[mode]}`}
      className="fixed bottom-4 right-16 z-40 inline-flex h-9 w-9 items-center justify-center rounded-full border border-border bg-background/70 text-muted-foreground opacity-50 backdrop-blur-md transition-opacity hover:opacity-100 focus-visible:opacity-100"
    >
      {mode === "full" ? <CollapseIcon /> : <ExpandIcon />}
    </button>
  );
}

function ExpandIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" aria-hidden="true">
      <path
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9 5H5v4m0 6v4h4m6-14h4v4m0 6v4h-4M10 12h4"
      />
    </svg>
  );
}

function CollapseIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" aria-hidden="true">
      <path
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M5 9h4V5m10 4h-4V5M5 15h4v4m10-4h-4v4"
      />
    </svg>
  );
}
