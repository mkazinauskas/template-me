import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const getTemplate = vi.hoisted(() =>
  vi.fn<(id: string) => Promise<{ name: string } | undefined>>(async () => ({
    name: "Offer Letter",
  }))
);
vi.mock("@/components/template-detail", () => ({
  getTemplate,
  TemplateDetail: ({ id, warningsParam }: { id: string; warningsParam?: string }) => (
    <div data-testid="template-detail" data-id={id} data-warnings={warningsParam ?? ""} />
  ),
}));

async function importPage() {
  return import("@/app/client/dashboard/templates/[id]/page");
}

describe("ClientTemplatePage route", () => {
  it("delegates to <TemplateDetail> with the resolved id and warnings param", async () => {
    const { default: ClientTemplatePage } = await importPage();
    const element = await ClientTemplatePage({
      params: Promise.resolve({ id: "t1" }),
      searchParams: Promise.resolve({ warnings: '["oops"]' }),
    });
    render(element);

    const node = screen.getByTestId("template-detail");
    expect(node).toHaveAttribute("data-id", "t1");
    expect(node).toHaveAttribute("data-warnings", '["oops"]');
  });

  it("builds metadata from the shared getTemplate helper", async () => {
    getTemplate.mockResolvedValueOnce({ name: "NDA" });
    const { generateMetadata } = await importPage();
    const meta = await generateMetadata({ params: Promise.resolve({ id: "t9" }) });

    expect(getTemplate).toHaveBeenCalledWith("t9");
    expect(meta.title).toBe("NDA");
    expect(meta.robots).toMatchObject({ index: false });
  });

  it("falls back to a not-found title when the template is hidden", async () => {
    getTemplate.mockResolvedValueOnce(undefined);
    const { generateMetadata } = await importPage();
    const meta = await generateMetadata({ params: Promise.resolve({ id: "missing" }) });

    expect(meta.title).toBe("Template not found");
  });
});
