"use client";

import { useEffect, useSyncExternalStore } from "react";
import { THEME_STORAGE_KEY, type Theme } from "@/lib/theme";

const order: Theme[] = ["light", "dark", "system"];

const labels: Record<Theme, string> = {
  light: "Light",
  dark: "Dark",
  system: "System",
};

function prefersDark(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
  );
}

function resolve(theme: Theme): "light" | "dark" {
  return theme === "system" ? (prefersDark() ? "dark" : "light") : theme;
}

function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = resolve(theme);
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

function getSnapshot(): Theme {
  const stored = localStorage.getItem(THEME_STORAGE_KEY) as Theme | null;
  return stored && order.includes(stored) ? stored : "system";
}

// The pre-paint script has already set `data-theme`; the server has no way to
// know the stored choice, so it renders the "system" affordance.
const getServerSnapshot = (): Theme => "system";

function setTheme(theme: Theme) {
  localStorage.setItem(THEME_STORAGE_KEY, theme);
  applyTheme(theme);
  listeners.forEach((l) => l());
}

/**
 * A deliberately low-key control pinned to the bottom-right corner that cycles
 * the site theme light → dark → system and persists the choice to localStorage.
 * Rendered once, globally, from the root layout.
 */
export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  // While following the OS, keep `data-theme` current as the OS preference flips.
  useEffect(() => {
    if (theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyTheme("system");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [theme]);

  function cycle() {
    // Read the live snapshot rather than the render-closure `theme` so quick
    // successive clicks (before React re-renders) still advance correctly.
    const from = getSnapshot();
    setTheme(order[(order.indexOf(from) + 1) % order.length]);
  }

  return (
    <button
      type="button"
      onClick={cycle}
      aria-label={`Theme: ${labels[theme]}. Click to change.`}
      title={`Theme: ${labels[theme]}`}
      className="fixed bottom-4 right-4 z-40 inline-flex h-9 w-9 items-center justify-center rounded-full border border-border bg-background/70 text-muted-foreground opacity-50 backdrop-blur-md transition-opacity hover:opacity-100 focus-visible:opacity-100"
    >
      {theme === "light" && <SunIcon />}
      {theme === "dark" && <MoonIcon />}
      {theme === "system" && <MonitorIcon />}
    </button>
  );
}

function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" aria-hidden="true">
      <circle cx="12" cy="12" r="4" strokeWidth="1.8" />
      <path
        strokeWidth="1.8"
        strokeLinecap="round"
        d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32l1.41 1.41M2 12h2m16 0h2M4.93 19.07l1.41-1.41m11.32-11.32l1.41-1.41"
      />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden="true">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z" />
    </svg>
  );
}

function MonitorIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" aria-hidden="true">
      <rect x="3" y="4" width="18" height="12" rx="1.5" strokeWidth="1.8" />
      <path strokeWidth="1.8" strokeLinecap="round" d="M8 20h8m-4-4v4" />
    </svg>
  );
}
