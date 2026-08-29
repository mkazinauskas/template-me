import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { Template } from "@/db/schema";

const state = vi.hoisted(() => ({
  template: null as Template | null,
}));

vi.mock("@/db", () => ({
  getDb: () => ({
    select: () => ({
      from: () => ({
        where: () => Promise.resolve(state.template ? [state.template] : []),
      }),
    }),
  }),
}));

const notFound = vi.hoisted(() => vi.fn(() => {
  throw new Error("NEXT_NOT_FOUND");
}));
vi.mock("next/navigation", () => ({ notFound }));

// FillForm is a heavy client component (fetches, debounced preview, etc.)
// covered in full by fill-form.test.tsx; here we only need to assert the
// page passes it the right props.
vi.mock("@/components/fill-form", () => ({
  FillForm: ({ templateId, templateName, fields }: { templateId: string; templateName: string; fields: unknown[] }) => (
    <div data-testid="fill-form">
      {templateId} / {templateName} / {fields.length} fields
    </div>
  ),
}));

vi.mock("@/components/delete-template-button", () => ({
  DeleteTemplateButton: ({ templateId }: { templateId: string }) => (
    <button>Delete {templateId}</button>
  ),
}));

function makeTemplate(overrides: Partial<Template> = {}): Template {
  return {
    id: "t1",
    name: "Offer Letter",
    originalFilename: "offer.docx",
    blobUrl: "https://blob/offer.docx",
    blobPathname: "templates/offer.docx",
    fields: [{ key: "full_name", label: "Full name", type: "string", params: [] }],
    createdAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

async function renderTemplatePage(id: string, searchParams: { warnings?: string } = {}) {
  const { default: TemplatePage } = await import("@/app/templates/[id]/page");
  const element = await TemplatePage({
    params: Promise.resolve({ id }),
    searchParams: Promise.resolve(searchParams),
  });
  render(element);
}

describe("TemplatePage", () => {
  beforeEach(() => {
    state.template = null;
    notFound.mockClear();
  });

  it("calls notFound() when the template does not exist", async () => {
    await expect(renderTemplatePage("missing")).rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFound).toHaveBeenCalled();
  });

  it("renders the template name, filename, and delete button", async () => {
    state.template = makeTemplate({ name: "NDA", originalFilename: "nda.docx" });
    await renderTemplatePage("t1");

    expect(screen.getByRole("heading", { name: "NDA" })).toBeInTheDocument();
    expect(screen.getByText("nda.docx")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete t1" })).toBeInTheDocument();
  });

  it("passes the template's id, name, and fields through to FillForm", async () => {
    state.template = makeTemplate({ id: "t1", name: "Offer Letter" });
    await renderTemplatePage("t1");

    expect(screen.getByTestId("fill-form")).toHaveTextContent("t1 / Offer Letter / 1 fields");
  });

  it("shows no warnings banner when the warnings query param is absent", async () => {
    state.template = makeTemplate();
    await renderTemplatePage("t1");

    expect(screen.queryByText("Some tags weren't fully understood")).not.toBeInTheDocument();
  });

  it("renders a warnings banner from a valid JSON warnings query param", async () => {
    state.template = makeTemplate();
    const warnings = JSON.stringify(["Field \"x\": unrecognized type"]);
    await renderTemplatePage("t1", { warnings });

    expect(screen.getByText("Some tags weren't fully understood")).toBeInTheDocument();
    expect(screen.getByText('Field "x": unrecognized type')).toBeInTheDocument();
  });

  it("silently ignores a malformed warnings query param", async () => {
    state.template = makeTemplate();
    await renderTemplatePage("t1", { warnings: "{not json" });

    expect(screen.queryByText("Some tags weren't fully understood")).not.toBeInTheDocument();
  });
});
