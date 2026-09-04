import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/client/dashboard",
}));

vi.mock("@/lib/auth", () => ({
  auth: {
    api: {
      getSession: () => Promise.resolve({ user: { id: "user-1", email: "owner@example.com" } }),
    },
  },
}));

vi.mock("next/headers", () => ({
  headers: () => Promise.resolve(new Headers()),
}));

// TemplateList is an async Server Component; React's client renderer (used by
// RTL/jsdom) can't render a component that returns a Promise, so it's mocked
// here the way Next's own testing docs recommend for async Server Component
// children — its own behavior is covered by template-list.test.tsx. The
// dashboard renders it twice (own + public), so the stub echoes back the
// props that distinguish the two instances.
vi.mock("@/components/template-list", () => ({
  TemplateList: ({
    page,
    scope = "own",
    hrefBase,
  }: {
    page?: number;
    scope?: "own" | "public";
    hrefBase?: string;
  }) => (
    <div data-testid={`template-list-${scope}`} data-href-base={hrefBase}>
      page {page}
    </div>
  ),
}));

// DashboardPage itself is an async Server Component (it awaits `searchParams`),
// so we await it directly to get the resolved element before rendering it.
async function renderDashboard(searchParams: { page?: string; ppage?: string } = {}) {
  const { default: DashboardPage } = await import("@/app/client/dashboard/page");
  const element = await DashboardPage({ searchParams: Promise.resolve(searchParams) });
  render(element);
}

describe("DashboardPage", () => {
  it("renders the heading, upload form, and both template lists", async () => {
    await renderDashboard();

    expect(screen.getByRole("heading", { name: "Docx Template → PDF" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Upload template" })).toBeInTheDocument();
    expect(screen.getByTestId("template-list-own")).toHaveTextContent("page 1");
    expect(screen.getByTestId("template-list-public")).toHaveTextContent("page 1");
  });

  it("points every template list at the client templates route", async () => {
    await renderDashboard();
    for (const list of screen.getAllByTestId(/^template-list-/)) {
      expect(list).toHaveAttribute("data-href-base", "/client/dashboard/templates");
    }
  });

  it("parses the numeric `page` query param through to the own list", async () => {
    await renderDashboard({ page: "3" });
    expect(screen.getByTestId("template-list-own")).toHaveTextContent("page 3");
  });

  it("parses the numeric `ppage` query param through to the public list", async () => {
    await renderDashboard({ ppage: "4" });
    expect(screen.getByTestId("template-list-public")).toHaveTextContent("page 4");
  });

  it("clamps an invalid page query param to 1", async () => {
    await renderDashboard({ page: "not-a-number" });
    expect(screen.getByTestId("template-list-own")).toHaveTextContent("page 1");
  });

  it("clamps a page of 0 or negative to 1", async () => {
    await renderDashboard({ page: "-5" });
    expect(screen.getByTestId("template-list-own")).toHaveTextContent("page 1");
  });

  it("links the header logo back to the landing page", async () => {
    await renderDashboard();
    expect(screen.getByRole("link", { name: "Template Me home" })).toHaveAttribute("href", "/");
  });
});
