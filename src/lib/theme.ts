export type Theme = "light" | "dark" | "system";

export const THEME_STORAGE_KEY = "theme";

/**
 * Runs before first paint (injected into <head> in the root layout) to set
 * `data-theme` on <html> from the stored preference, resolving "system" to a
 * concrete value via the OS media query. Keeping this inline avoids a flash of
 * the wrong theme before React hydrates.
 */
export const themeScript = `(function(){try{var t=localStorage.getItem("${THEME_STORAGE_KEY}")||"system";var d=t==="dark"||(t!=="light"&&matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.dataset.theme=d?"dark":"light";}catch(e){}})();`;
