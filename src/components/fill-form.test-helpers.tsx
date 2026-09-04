import { vi } from "vitest";
import { orpc } from "@/lib/orpc";
import type { TemplateField } from "@/db/schema";

export const FIELDS: TemplateField[] = [
  { key: "full_name", label: "Full name", type: "string", params: [] },
  { key: "salary", label: "Salary", type: "number", params: ["2"] },
  { key: "start_date", label: "Start date", type: "date", params: [] },
  { key: "relocation", label: "Relocation", type: "boolean", params: ["Yes", "No"] },
  {
    key: "employment_type",
    label: "Employment type",
    type: "select",
    params: ["Full-time", "Part-time"],
  },
  {
    key: "person.first_name",
    label: "First name",
    type: "string",
    params: [],
    group: "person",
    groupLabel: "Person",
  },
];

/** A stand-in for the `File` the `generate` procedure resolves to. */
export function pdfBlob(content = "pdf-bytes") {
  return new File([content], "preview.pdf", { type: "application/pdf" });
}

/**
 * Resets the mocked oRPC client (`generate` resolves to a fake PDF) and the
 * object-URL helpers, and clears localStorage — SingleFillForm persists values
 * keyed by templateId and restores them on mount, and every test here uses
 * "t1". Pair with restoreFillFormGlobals.
 */
export function installFillFormGlobals() {
  localStorage.clear();
  vi.mocked(orpc.templates.generate).mockReset().mockResolvedValue(pdfBlob());
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

export function restoreFillFormGlobals() {
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
