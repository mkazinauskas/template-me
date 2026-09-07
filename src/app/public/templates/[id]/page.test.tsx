import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const templateMetadata = vi.hoisted(() =>
  vi.fn(async (id: string, mode = "single") => ({
    title: `${id} title (${mode})`,
    robots: { index: false, follow: false },
  }))
);
vi.mock("@/components/template-detail", () => ({
  templateMetadata,
  TemplateDetail: ({
    id,
    mode,
    basePath,
    warningsParam,
  }: {
    id: string;
    mode?: string;
    basePath: string;
    warningsParam?: string;
  }) => (
    <div
      data-testid="template-detail"
      data-id={id}
      data-mode={mode ?? "single"}
      data-base-path={basePath}
      data-warnings={warningsParam ?? ""}
    />
  ),
}));

const BASE_PATH = "/public/templates";

describe("PublicTemplatePage routes", () => {
  it("delegates the template's own route to <TemplateDetail> with the warnings param", async () => {
    const { default: Page } = await import("@/app/public/templates/[id]/page");
    render(
      await Page({
        params: Promise.resolve({ id: "t1" }),
        searchParams: Promise.resolve({ warnings: '["oops"]' }),
      })
    );

    const node = screen.getByTestId("template-detail");
    expect(node).toHaveAttribute("data-id", "t1");
    expect(node).toHaveAttribute("data-mode", "single");
    expect(node).toHaveAttribute("data-base-path", BASE_PATH);
    expect(node).toHaveAttribute("data-warnings", '["oops"]');
  });

  it("renders the bulk mode at /[id]/bulk", async () => {
    const { default: Page } = await import("@/app/public/templates/[id]/bulk/page");
    render(await Page({ params: Promise.resolve({ id: "t1" }) }));

    const node = screen.getByTestId("template-detail");
    expect(node).toHaveAttribute("data-mode", "bulk");
    expect(node).toHaveAttribute("data-base-path", BASE_PATH);
  });

  it("renders the send mode at /[id]/send", async () => {
    const { default: Page } = await import("@/app/public/templates/[id]/send/page");
    render(await Page({ params: Promise.resolve({ id: "t1" }) }));

    expect(screen.getByTestId("template-detail")).toHaveAttribute("data-mode", "send");
  });

  it("builds each route's metadata from the shared helper, tagged with its mode", async () => {
    const own = await import("@/app/public/templates/[id]/page");
    const bulk = await import("@/app/public/templates/[id]/bulk/page");
    const send = await import("@/app/public/templates/[id]/send/page");

    const meta = await own.generateMetadata({ params: Promise.resolve({ id: "t9" }) });
    await bulk.generateMetadata({ params: Promise.resolve({ id: "t9" }) });
    await send.generateMetadata({ params: Promise.resolve({ id: "t9" }) });

    expect(meta.robots).toMatchObject({ index: false });
    expect(templateMetadata.mock.calls).toEqual([["t9"], ["t9", "bulk"], ["t9", "send"]]);
  });
});
