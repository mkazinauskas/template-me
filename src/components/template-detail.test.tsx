import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { Template } from "@/db/schema";
import type { FillMode } from "@/lib/template-routes";

const state = vi.hoisted(() => ({
  template: null as Template | null,
  session: { user: { id: "user-1", email: "owner@example.com" } } as { user: { id: string; email: string } } | null,
}));

vi.mock("@/db", () => ({
  getDb: () => ({
    // The page fetches by id and decides owner-vs-public access in code
    // (see @/lib/template-access), so the mock just returns the fixture row.
    select: () => ({
      from: () => ({
        where: () => Promise.resolve(state.template ? [state.template] : []),
      }),
    }),
  }),
}));

vi.mock("@/lib/auth", () => ({
  auth: { api: { getSession: () => Promise.resolve(state.session) } },
}));

vi.mock("next/headers", () => ({
  headers: () => Promise.resolve(new Headers()),
}));

const notFound = vi.hoisted(() => vi.fn(() => {
  throw new Error("NEXT_NOT_FOUND");
}));
vi.mock("next/navigation", () => ({
  notFound,
  usePathname: () => "/public/templates/t1",
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

// FillForm is a heavy client component (fetches, debounced preview, etc.)
// covered in full by fill-form.test.tsx; here we only need to assert the
// page passes it the right props.
vi.mock("@/components/fill-form", () => ({
  FillForm: ({
    templateId,
    templateName,
    fields,
    mode,
    basePath,
  }: {
    templateId: string;
    templateName: string;
    fields: unknown[];
    mode: string;
    basePath: string;
  }) => (
    <div data-testid="fill-form" data-mode={mode} data-base-path={basePath}>
      {templateId} / {templateName} / {fields.length} fields
    </div>
  ),
}));

vi.mock("@/components/delete-template-button", () => ({
  DeleteTemplateButton: ({ templateId }: { templateId: string }) => (
    <button>Delete {templateId}</button>
  ),
}));

vi.mock("@/components/download-template-button", () => ({
  DownloadTemplateButton: ({ templateId }: { templateId: string }) => (
    <button>Download {templateId}</button>
  ),
}));

vi.mock("@/components/publish-toggle", () => ({
  PublishToggle: ({ templateId, isPublic }: { templateId: string; isPublic: boolean }) => (
    <button>Publish {templateId} {String(isPublic)}</button>
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
    userId: "user-1",
    isPublic: false,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

const BASE_PATH = "/client/dashboard/templates";

async function renderTemplatePage(
  id: string,
  { warnings, mode }: { warnings?: string; mode?: FillMode } = {}
) {
  const { TemplateDetail } = await import("@/components/template-detail");
  const element = await TemplateDetail({
    id,
    mode,
    basePath: BASE_PATH,
    warningsParam: warnings,
  });
  render(element);
}

describe("TemplateDetail", () => {
  beforeEach(() => {
    state.template = null;
    state.session = { user: { id: "user-1", email: "owner@example.com" } };
    notFound.mockClear();
  });

  it("calls notFound() when the template does not exist", async () => {
    await expect(renderTemplatePage("missing")).rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFound).toHaveBeenCalled();
  });

  it("calls notFound() for a private template when there is no session", async () => {
    state.template = makeTemplate();
    state.session = null;
    await expect(renderTemplatePage("t1")).rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFound).toHaveBeenCalled();
  });

  it("calls notFound() when a private template belongs to a different user", async () => {
    state.template = makeTemplate({ userId: "someone-else" });
    await expect(renderTemplatePage("t1")).rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFound).toHaveBeenCalled();
  });

  it("renders the template name, filename, delete button, download button, and publish toggle for the owner", async () => {
    state.template = makeTemplate({ name: "NDA", originalFilename: "nda.docx" });
    await renderTemplatePage("t1");

    expect(screen.getByRole("heading", { name: "NDA" })).toBeInTheDocument();
    expect(screen.getByText("nda.docx")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete t1" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Download t1" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Publish t1 false" })).toBeInTheDocument();
  });

  it("shows a public template to a non-owner without owner controls", async () => {
    state.session = { user: { id: "user-2", email: "other@example.com" } };
    state.template = makeTemplate({ userId: "someone-else", isPublic: true });
    await renderTemplatePage("t1");

    expect(screen.getByRole("heading", { name: "Offer Letter" })).toBeInTheDocument();
    expect(screen.getByText("Public template")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Delete/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Download/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Publish/ })).not.toBeInTheDocument();
  });

  it("shows a public template to an anonymous visitor", async () => {
    state.session = null;
    state.template = makeTemplate({ userId: "someone-else", isPublic: true });
    await renderTemplatePage("t1");

    expect(screen.getByRole("heading", { name: "Offer Letter" })).toBeInTheDocument();
    expect(screen.getByText("Public template")).toBeInTheDocument();
  });

  it("passes the template's id, name, and fields through to FillForm", async () => {
    state.template = makeTemplate({ id: "t1", name: "Offer Letter" });
    await renderTemplatePage("t1");

    expect(screen.getByTestId("fill-form")).toHaveTextContent("t1 / Offer Letter / 1 fields");
  });

  it("gives FillForm the routed mode and this template's own path", async () => {
    state.template = makeTemplate({ id: "t1" });
    await renderTemplatePage("t1", { mode: "bulk" });

    const node = screen.getByTestId("fill-form");
    expect(node).toHaveAttribute("data-mode", "bulk");
    expect(node).toHaveAttribute("data-base-path", `${BASE_PATH}/t1`);
  });

  it("defaults to the single-fill mode on the template's own route", async () => {
    state.template = makeTemplate();
    await renderTemplatePage("t1");

    expect(screen.getByTestId("fill-form")).toHaveAttribute("data-mode", "single");
  });

  it("renders the owner-only send mode for the owner", async () => {
    state.template = makeTemplate();
    await renderTemplatePage("t1", { mode: "send" });

    expect(screen.getByTestId("fill-form")).toHaveAttribute("data-mode", "send");
  });

  it("calls notFound() when a non-owner reaches the owner-only send mode", async () => {
    state.session = { user: { id: "user-2", email: "other@example.com" } };
    state.template = makeTemplate({ userId: "someone-else", isPublic: true });

    await expect(renderTemplatePage("t1", { mode: "send" })).rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFound).toHaveBeenCalled();
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

describe("templateMetadata", () => {
  beforeEach(() => {
    state.template = null;
    state.session = { user: { id: "user-1", email: "owner@example.com" } };
  });

  async function metadataFor(id: string, mode?: FillMode) {
    const { templateMetadata } = await import("@/components/template-detail");
    return mode ? templateMetadata(id, mode) : templateMetadata(id);
  }

  it("titles the template's own route with just the template name", async () => {
    state.template = makeTemplate({ name: "NDA" });
    const meta = await metadataFor("t1");

    expect(meta.title).toBe("NDA");
    expect(meta.description).toBe('Fill in "NDA" and download it as a PDF.');
    expect(meta.robots).toMatchObject({ index: false, follow: false });
  });

  it("appends the mode label on a mode route", async () => {
    state.template = makeTemplate({ name: "NDA" });

    expect((await metadataFor("t1", "bulk")).title).toBe(
      "NDA — Create multiple from a spreadsheet"
    );
    expect((await metadataFor("t1", "send")).title).toBe("NDA — Send a link to fill in");
  });

  it("falls back to a not-found title when the template is hidden", async () => {
    const meta = await metadataFor("missing");

    expect(meta.title).toBe("Template not found");
    expect(meta.robots).toMatchObject({ index: false });
  });
});
