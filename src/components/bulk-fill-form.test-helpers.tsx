import { vi } from "vitest";
import { orpc } from "@/lib/orpc";
import type { TemplateField } from "@/db/schema";

export const FIELDS: TemplateField[] = [
  { key: "full_name", label: "Full name", type: "string", params: [] },
  { key: "relocation", label: "Relocation", type: "boolean", params: ["Yes", "No"] },
];

export function csvFile(content: string, name = "data.csv") {
  return new File([content], name, { type: "text/csv" });
}

/**
 * Resets the mocked oRPC client and the object-URL helpers BulkFillForm relies
 * on, and clears localStorage (the form persists rows/mapping keyed by
 * templateId and restores them on mount, so state must not leak between tests —
 * they all use "t1"). Pair with `restoreBulkFillGlobals` in afterEach.
 */
export function installBulkFillGlobals() {
  localStorage.clear();
  vi.mocked(orpc.templates.generate)
    .mockReset()
    .mockResolvedValue(new File(["pdf"], "preview.pdf", { type: "application/pdf" }));
  vi.mocked(orpc.templates.generateBulk)
    .mockReset()
    .mockResolvedValue(new File(["zip"], "batch.zip", { type: "application/zip" }));
  vi.stubGlobal(
    "URL",
    Object.assign(URL, {
      createObjectURL: vi.fn(() => "blob:mock-url"),
      revokeObjectURL: vi.fn(),
    })
  );
}

export function restoreBulkFillGlobals() {
  vi.unstubAllGlobals();
}

/** Replaces `document.createElement("a").click` with a spy so download triggers can be asserted. */
export function spyOnAnchorClick() {
  const clickSpy = vi.fn();
  const originalCreateElement = document.createElement.bind(document);
  vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
    const el = originalCreateElement(tag);
    if (tag === "a") el.click = clickSpy;
    return el;
  });
  return clickSpy;
}
