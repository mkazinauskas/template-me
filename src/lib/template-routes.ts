/**
 * Base paths of the two audience-specific template route trees. Each template
 * lives at `<base>/[id]`, with one route per fill mode underneath it, so these
 * constants have to agree across all of those page files and the mode switcher
 * that links between them.
 */
export const CLIENT_TEMPLATES_PATH = "/client/dashboard/templates";
export const PUBLIC_TEMPLATES_PATH = "/public/templates";

/**
 * The three ways to use a template — one route each. `segment` is appended to
 * the template's own path (`<base>/[id]`); "single" is that page itself, so its
 * segment is empty. Owner-only modes 404 for everyone else (enforced in
 * `TemplateDetail`, not just hidden from the switcher).
 */
export const FILL_MODES = [
  { value: "single", label: "Fill one document", segment: "", ownerOnly: false },
  {
    value: "bulk",
    label: "Create multiple from a spreadsheet",
    segment: "/bulk",
    ownerOnly: false,
  },
  { value: "send", label: "Send a link to fill in", segment: "/send", ownerOnly: true },
] as const;

export type FillMode = (typeof FILL_MODES)[number]["value"];

/** Whether `mode` is reserved for the template's owner. */
export function isOwnerOnlyMode(mode: FillMode): boolean {
  return FILL_MODES.some((m) => m.value === mode && m.ownerOnly);
}

/** The switcher label for `mode`, reused in each route's page title. */
export function fillModeLabel(mode: FillMode): string {
  return FILL_MODES.find((m) => m.value === mode)!.label;
}
