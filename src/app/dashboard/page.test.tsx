import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
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
// children — its own behavior is covered by template-list.test.tsx.
vi.mock("@/components/template-list", () => ({
  TemplateList: ({ page }: { page?: number }) => <div data-testid="template-list">page {page}</div>,
}));

// DashboardPage itself is an async Server Component (it awaits `searchParams`),
// so we await it directly to get the resolved element before rendering it.
async function renderDashboard(searchParams: { page?: string } = {}) {
  const { default: DashboardPage } = await import("@/app/dashboard/page");
  const element = await DashboardPage({ searchParams: Promise.resolve(searchParams) });
  render(element);
}

describe("DashboardPage", () => {
  it("renders the heading, upload form, and template list", async () => {
    await renderDashboard();

    expect(screen.getByRole("heading", { name: "Docx Template → PDF" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Upload template" })).toBeInTheDocument();
    expect(screen.getByTestId("template-list")).toHaveTextContent("page 1");
  });

  it("defaults to page 1 when no page query param is given", async () => {
    await renderDashboard();
    expect(screen.getByTestId("template-list")).toHaveTextContent("page 1");
  });

  it("parses a numeric page query param through to TemplateList", async () => {
    await renderDashboard({ page: "3" });
    expect(screen.getByTestId("template-list")).toHaveTextContent("page 3");
  });

  it("clamps an invalid page query param to 1", async () => {
    await renderDashboard({ page: "not-a-number" });
    expect(screen.getByTestId("template-list")).toHaveTextContent("page 1");
  });

  it("clamps a page of 0 or negative to 1", async () => {
    await renderDashboard({ page: "-5" });
    expect(screen.getByTestId("template-list")).toHaveTextContent("page 1");
  });

  it("links the home button back to the landing page", async () => {
    await renderDashboard();
    expect(screen.getByRole("link", { name: "← Home" })).toHaveAttribute("href", "/");
  });
});
