import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/client/dashboard/templates",
  redirect: vi.fn(() => {
    throw new Error("NEXT_REDIRECT");
  }),
}));

const state = vi.hoisted(() => ({
  session: { user: { id: "user-1", email: "owner@example.com" } } as
    | { user: { id: string; email: string } }
    | null,
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
    return <div data-testid={`template-list-${String(props.scope)}`} />;
  },
}));

async function renderPage(searchParams: { page?: string; ppage?: string; q?: string } = {}) {
  templateListProps.calls.length = 0;
  const { default: ClientTemplatesPage } = await import("@/app/client/dashboard/templates/page");
  const element = await ClientTemplatesPage({ searchParams: Promise.resolve(searchParams) });
  render(element);
}

describe("ClientTemplatesPage", () => {
  it("renders the own + public sections for a signed-in user", async () => {
    state.session = { user: { id: "user-1", email: "owner@example.com" } };
    await renderPage();

    expect(screen.getByRole("heading", { name: "Browse templates" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Your templates" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Public templates" })).toBeInTheDocument();
    expect(screen.getByTestId("template-list-own")).toBeInTheDocument();
    expect(screen.getByTestId("template-list-public")).toBeInTheDocument();
  });

  it("passes the right scope, page param, and hrefBase to each list", async () => {
    state.session = { user: { id: "user-1", email: "owner@example.com" } };
    await renderPage({ page: "2", ppage: "3", q: "nda" });

    expect(templateListProps.calls).toEqual([
      expect.objectContaining({
        scope: "own",
        page: 2,
        q: "nda",
        pageParam: "page",
        hrefBase: "/client/dashboard/templates",
      }),
      expect.objectContaining({
        scope: "public",
        page: 3,
        q: "nda",
        pageParam: "ppage",
        hrefBase: "/client/dashboard/templates",
      }),
    ]);
  });

  it("redirects to sign-in when there is no session", async () => {
    state.session = null;
    await expect(renderPage()).rejects.toThrow("NEXT_REDIRECT");
    const { redirect } = await import("next/navigation");
    expect(redirect).toHaveBeenCalledWith("/sign-in?redirect=/client/dashboard/templates");
  });
});
