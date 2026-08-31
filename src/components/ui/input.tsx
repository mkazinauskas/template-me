// Shared input styling primitives. Rather than a wrapping `<TextInput>`
// component (inputs here range over text/number/date/select and need full
// control of their own props), these are exported class strings so every
// call site still renders a plain, fully-controllable <input>/<select>.

/** Standard full-size form field (labelled inputs, selects). */
export const inputClasses =
  "rounded-md border border-border bg-transparent px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-focus-ring";

/** Compact variant used for dense table cells (bulk-fill row editing). */
export const compactInputClasses =
  "w-full min-w-[140px] rounded-md border border-border bg-transparent px-2 py-1 text-xs outline-none focus:ring-2 focus:ring-focus-ring";
