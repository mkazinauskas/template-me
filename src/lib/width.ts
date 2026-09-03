export type WidthMode = "page" | "full";

export const WIDTH_STORAGE_KEY = "width";

/**
 * Runs before first paint (injected into <head> in the root layout) to set
 * `data-width` on <html> from the stored preference. Mirrors `themeScript`:
 * keeping it inline avoids a flash of the constrained layout before React
 * hydrates when the reader has opted into the full-width view.
 */
export const widthScript = `(function(){try{var w=localStorage.getItem("${WIDTH_STORAGE_KEY}");document.documentElement.dataset.width=w==="full"?"full":"page";}catch(e){}})();`;
