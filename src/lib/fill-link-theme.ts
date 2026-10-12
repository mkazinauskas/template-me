import { z } from "zod";
import type { CSSProperties } from "react";

const hexColor = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, "Colors must be 6-digit hex values, e.g. #1a2b3c")
  .transform((c) => c.toLowerCase());

/**
 * The colors a fill link's public page can be dressed in. Shared by the API
 * (validation), the new-link dialog (editing) and `/fill/[code]` (rendering).
 */
export const fillLinkThemeColors = z.object({
  background: hexColor,
  card: hexColor,
  heading: hexColor,
  text: hexColor,
  field: hexColor,
  button: hexColor,
  buttonText: hexColor,
});

export type FillLinkThemeColors = z.infer<typeof fillLinkThemeColors>;

/** Each color slot with the label the editor shows for it, in display order. */
export const THEME_COLOR_SLOTS: Array<{ key: keyof FillLinkThemeColors; label: string }> = [
  { key: "background", label: "Page background" },
  { key: "card", label: "Card background" },
  { key: "heading", label: "Heading" },
  { key: "text", label: "Text" },
  { key: "field", label: "Field background" },
  { key: "button", label: "Button" },
  { key: "buttonText", label: "Button text" },
];

/** Where a fresh custom theme starts: close to the app's own light look. */
export const DEFAULT_THEME_COLORS: FillLinkThemeColors = {
  background: "#f4f4f5",
  card: "#ffffff",
  heading: "#171717",
  text: "#3f3f46",
  field: "#ffffff",
  button: "#171717",
  buttonText: "#ffffff",
};

/**
 * CSS custom properties that re-skin everything inside the fill page's
 * themed region. The app's semantic tokens (`--foreground`, `--border`, …)
 * are overridden so shared form components pick the theme up untouched; the
 * `--fill-*` ones are read by the fill page itself and `globals.css`.
 */
export function themeStyle(theme: FillLinkThemeColors): CSSProperties {
  return {
    "--foreground": theme.text,
    "--muted-foreground": `color-mix(in srgb, ${theme.text} 75%, transparent)`,
    "--muted-foreground-subtle": `color-mix(in srgb, ${theme.text} 50%, transparent)`,
    "--border": `color-mix(in srgb, ${theme.text} 22%, transparent)`,
    "--focus-ring": `color-mix(in srgb, ${theme.button} 45%, transparent)`,
    "--fill-card": theme.card,
    "--fill-heading": theme.heading,
    "--fill-field": theme.field,
    "--fill-button": theme.button,
    "--fill-button-text": theme.buttonText,
    backgroundColor: theme.background,
    color: theme.text,
  } as CSSProperties;
}
