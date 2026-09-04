import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/public/templates",
}));

const state = vi.hoisted(() => ({
  session: null as { user: { id: string; email: string } } | null,
}));

vi.mock("@/lib/auth", () => ({
  auth: { api: { getSession: () => Promise.resolve(state.session) } },
}));

vi.mock("next/headers", () => ({
  headers: () => Promise.resolve(new Headers()),
}));

const templateListProps = vi.hoisted(() => ({ calls: [] as Record<string, unknown>[] }));
vi.mock("@/components/template-list", () => ({
  TemplateList: (props: Record<string, unknown>) => {
    templateListProps.calls.push(props);
    return <div data-testid="template-list" data-scope={String(props.scope)} />;
  },
}));

async function renderPage(searchParams: { q?: string } = {}) {
  templateListProps.calls.length = 0;
  const { default: PublicTemplatesPage } = await import("@/app/public/templates/page");
  const element = await PublicTemplatesPage({ searchParams: Promise.resolve(searchParams) });
  render(element);
}

describe("PublicTemplatesPage", () => {
  it("renders the browse heading and search form for a logged-out visitor", async () => {
    state.session = null;
    await renderPage();

    expect(screen.getByRole("heading", { name: "Browse templates" })).toBeInTheDocument();
    expect(screen.getByText(/no account needed/i)).toBeInTheDocument();
    expect(screen.getByTestId("template-list")).toBeInTheDocument();
  });

  it("renders a single public, preview-capped list pointed at /public/templates", async () => {
    const { PUBLIC_PREVIEW_LIMIT } = await import("@/app/public/templates/page");
    state.session = null;
    await renderPage({ q: "offer" });

    expect(templateListProps.calls).toHaveLength(1);
    expect(templateListProps.calls[0]).toMatchObject({
      scope: "public",
      q: "offer",
      preview: { limit: PUBLIC_PREVIEW_LIMIT },
      hrefBase: "/public/templates",
    });
  });
});
