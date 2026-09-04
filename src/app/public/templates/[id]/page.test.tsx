import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const getTemplate = vi.hoisted(() => vi.fn(async () => ({ name: "Offer Letter" })));
vi.mock("@/components/template-detail", () => ({
  getTemplate,
  TemplateDetail: ({ id, warningsParam }: { id: string; warningsParam?: string }) => (
    <div data-testid="template-detail" data-id={id} data-warnings={warningsParam ?? ""} />
  ),
}));

async function importPage() {
  return import("@/app/public/templates/[id]/page");
}

describe("PublicTemplatePage route", () => {
  it("delegates to <TemplateDetail> with the resolved id and no warnings", async () => {
    const { default: PublicTemplatePage } = await importPage();
    const element = await PublicTemplatePage({
      params: Promise.resolve({ id: "pub1" }),
      searchParams: Promise.resolve({}),
    });
    render(element);

    const node = screen.getByTestId("template-detail");
    expect(node).toHaveAttribute("data-id", "pub1");
    expect(node).toHaveAttribute("data-warnings", "");
  });

  it("builds metadata from the shared getTemplate helper", async () => {
    getTemplate.mockResolvedValueOnce({ name: "Public NDA" });
    const { generateMetadata } = await importPage();
    const meta = await generateMetadata({ params: Promise.resolve({ id: "p9" }) });

    expect(getTemplate).toHaveBeenCalledWith("p9");
    expect(meta.title).toBe("Public NDA");
    expect(meta.robots).toMatchObject({ index: false });
  });
});
