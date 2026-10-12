"use client";

import { useCallback, useEffect, useState } from "react";
import type { FillLinkTheme } from "@/db/schema";
import { orpc, orpcErrorMessage } from "@/lib/orpc";
import {
  DEFAULT_THEME_COLORS,
  THEME_COLOR_SLOTS,
  themeStyle,
  type FillLinkThemeColors,
} from "@/lib/fill-link-theme";
import { buttonClasses } from "@/components/ui/button";
import { inputClasses } from "@/components/ui/input";
import { InlineConfirm } from "@/components/ui/inline-confirm";

/** The caller's saved page themes, plus the mutations that keep the list in sync. */
export function useFillLinkThemes() {
  const [themes, setThemes] = useState<FillLinkTheme[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    orpc.fillLinkThemes
      .list()
      .then(({ themes }) => {
        if (!cancelled) setThemes(themes);
      })
      .catch((err) => {
        if (!cancelled) setLoadError(orpcErrorMessage(err, "Failed to load themes"));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const sortIn = useCallback((theme: FillLinkTheme) => {
    setThemes((current) =>
      [...(current ?? []).filter((t) => t.id !== theme.id), theme].sort((a, b) =>
        a.name.localeCompare(b.name),
      ),
    );
  }, []);

  const create = useCallback(
    async (name: string, colors: FillLinkThemeColors) => {
      const { theme } = await orpc.fillLinkThemes.create({ name, colors });
      sortIn(theme);
      return theme;
    },
    [sortIn],
  );

  const update = useCallback(
    async (id: string, name: string, colors: FillLinkThemeColors) => {
      const { theme } = await orpc.fillLinkThemes.update({ id, name, colors });
      sortIn(theme);
      return theme;
    },
    [sortIn],
  );

  const remove = useCallback(async (id: string) => {
    await orpc.fillLinkThemes.delete({ id });
    setThemes((current) => current?.filter((t) => t.id !== id) ?? current);
  }, []);

  return { themes, loadError, create, update, remove };
}

const sameColors = (a: FillLinkThemeColors, b: FillLinkThemeColors) =>
  THEME_COLOR_SLOTS.every(({ key }) => a[key].toLowerCase() === b[key].toLowerCase());

/** A miniature of the recipient's page in the chosen colors. */
function ThemePreview({ colors }: { colors: FillLinkThemeColors }) {
  return (
    <div
      aria-hidden="true"
      style={themeStyle(colors)}
      className="rounded-lg border border-border p-3"
    >
      <div
        style={{ backgroundColor: colors.card }}
        className="flex flex-col gap-1.5 rounded-md p-3 shadow-sm"
      >
        <span style={{ color: colors.heading }} className="text-sm font-semibold">
          Your details
        </span>
        <span className="text-xs text-muted-foreground">A note from you goes here.</span>
        <span
          style={{ backgroundColor: colors.field }}
          className="mt-1 h-6 rounded border border-border"
        />
        <span
          style={{ backgroundColor: colors.button, color: colors.buttonText }}
          className="mt-1 rounded px-2 py-1 text-center text-xs font-medium"
        >
          Submit
        </span>
      </div>
    </div>
  );
}

/**
 * The "Page theme" section of the new-link form: keep the app's own look, or
 * pick colors for each part of the recipient's page — starting from scratch
 * or from a saved theme — and save them as a theme to reuse later.
 */
export function FillLinkThemePicker({
  colors,
  onChange,
}: {
  /** The colors the link will be shown in; null for the app's own look. */
  colors: FillLinkThemeColors | null;
  onChange: (colors: FillLinkThemeColors | null) => void;
}) {
  const { themes, loadError, create, update, remove } = useFillLinkThemes();
  // "" is the app's own look, "custom" is unsaved colors, anything else a saved theme's id.
  // Editing a link that already has colors starts on them as custom colors.
  const [selectedId, setSelectedId] = useState(() => (colors ? "custom" : ""));
  const [isNaming, setIsNaming] = useState(false);
  const [name, setName] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selected = themes?.find((t) => t.id === selectedId) ?? null;
  const isDirty = selected !== null && colors !== null && !sameColors(colors, selected.colors);

  function pick(id: string) {
    setSelectedId(id);
    setError(null);
    setIsNaming(false);
    if (id === "") onChange(null);
    else if (id === "custom") onChange(colors ?? DEFAULT_THEME_COLORS);
    else {
      const theme = themes?.find((t) => t.id === id);
      if (theme) onChange(theme.colors);
    }
  }

  async function run(action: () => Promise<FillLinkTheme>) {
    setIsSaving(true);
    setError(null);
    try {
      const theme = await action();
      setSelectedId(theme.id);
      setIsNaming(false);
      setName("");
    } catch (err) {
      setError(orpcErrorMessage(err, "Failed to save theme"));
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete(theme: FillLinkTheme) {
    setError(null);
    try {
      await remove(theme.id);
      // The link keeps the colors; they're just no longer a saved theme.
      setSelectedId("custom");
    } catch (err) {
      setError(orpcErrorMessage(err, "Failed to delete theme"));
    }
  }

  const saveNew = () => {
    if (colors) run(() => create(name.trim(), colors));
  };

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor="fill-link-theme" className="text-sm font-medium">
        Page theme
      </label>
      <select
        id="fill-link-theme"
        value={selectedId}
        onChange={(e) => pick(e.target.value)}
        className={inputClasses}
      >
        <option value="">Default look</option>
        <option value="custom">Custom colors</option>
        {themes && themes.length > 0 && (
          <optgroup label="Saved themes">
            {themes.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </optgroup>
        )}
      </select>

      {colors && (
        <div className="mt-1 flex flex-col gap-3 rounded-lg border border-border p-3">
          <div className="grid gap-3 sm:grid-cols-[1fr_10rem]">
            <div className="grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-2">
              {THEME_COLOR_SLOTS.map(({ key, label }) => (
                <label key={key} className="flex items-center gap-2 text-sm">
                  <input
                    type="color"
                    value={colors[key]}
                    onChange={(e) => {
                      if (selectedId === "") setSelectedId("custom");
                      onChange({ ...colors, [key]: e.target.value });
                    }}
                    className="h-7 w-9 shrink-0 cursor-pointer rounded border border-border bg-transparent p-0.5"
                  />
                  <span className="min-w-0 truncate">{label}</span>
                </label>
              ))}
            </div>
            <ThemePreview colors={colors} />
          </div>

          {isNaming ? (
            <div className="flex items-center gap-2">
              <input
                aria-label="New theme name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  // Enter would otherwise submit the surrounding link form.
                  if (e.key === "Enter") {
                    e.preventDefault();
                    if (name.trim()) saveNew();
                  } else if (e.key === "Escape") {
                    e.stopPropagation();
                    setIsNaming(false);
                  }
                }}
                maxLength={100}
                placeholder="Name this theme"
                className={`${inputClasses} min-w-0 flex-1`}
                autoFocus
              />
              <button
                type="button"
                onClick={() => setIsNaming(false)}
                disabled={isSaving}
                className="shrink-0 text-sm text-muted-foreground hover:underline disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={saveNew}
                disabled={isSaving || !name.trim()}
                className={buttonClasses({ size: "sm", className: "shrink-0" })}
              >
                {isSaving ? "Saving…" : "Save"}
              </button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => onChange(DEFAULT_THEME_COLORS)}
                disabled={sameColors(colors, DEFAULT_THEME_COLORS)}
                className="mr-auto text-sm text-muted-foreground hover:underline disabled:opacity-50 disabled:no-underline"
              >
                Reset to default
              </button>
              {selected && (
                <InlineConfirm
                  label="Delete theme"
                  pendingLabel="Deleting…"
                  onConfirm={() => handleDelete(selected)}
                />
              )}
              {selected && isDirty && (
                <button
                  type="button"
                  onClick={() => run(() => update(selected.id, selected.name, colors))}
                  disabled={isSaving}
                  className={buttonClasses({ variant: "secondary", size: "sm" })}
                >
                  Update theme
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setIsNaming(true);
                  setError(null);
                }}
                className={buttonClasses({ variant: "secondary", size: "sm" })}
              >
                Save as theme
              </button>
            </div>
          )}
        </div>
      )}

      {(loadError || error) && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {loadError ?? error}
        </p>
      )}
    </div>
  );
}
