import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { Template } from "@/db/schema";

let rowsResult: Template[] = [];
let totalResult: { total: number }[] = [{ total: 0 }];
let sessionResult: { user: { id: string; email: string } } | null = {
  user: { id: "user-1", email: "owner@example.com" },
};

vi.mock("@/db", () => ({
  getDb: () => ({
    select(arg?: unknown) {
      const isCountQuery = arg !== undefined;
      const builder = {
        from: () => builder,
        where: () => builder,
        orderBy: () => builder,
        limit: () => builder,
        offset: () => builder,
        then: (resolve: (v: unknown) => void, reject?: (e: unknown) => void) =>
          Promise.resolve(isCountQuery ? totalResult : rowsResult).then(resolve, reject),
      };
      return builder;
    },
  }),
}));

vi.mock("@/lib/auth", () => ({
  auth: { api: { getSession: () => Promise.resolve(sessionResult) } },
}));

vi.mock("next/headers", () => ({
  headers: () => Promise.resolve(new Headers()),
}));

function makeTemplate(overrides: Partial<Template>): Template {
  return {
    id: "id-1",
    name: "Offer Letter",
    originalFilename: "offer.docx",
    blobUrl: "https://blob/offer.docx",
    blobPathname: "templates/offer.docx",
    fields: [],
    userId: "user-1",
    createdAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

// TemplateList is an async Server Component; Vitest/RTL can't render it directly
// (see next.js testing docs), so we await the component function ourselves to
// get the resolved element before handing it to render().
async function renderTemplateList(props: { page?: number } = {}) {
  const { TemplateList } = await import("@/components/template-list");
  const element = await TemplateList(props);
  render(element);
}

describe("TemplateList", () => {
  beforeEach(() => {
    rowsResult = [];
    totalResult = [{ total: 0 }];
    sessionResult = { user: { id: "user-1", email: "owner@example.com" } };
  });

  it("prompts to sign in when there is no session", async () => {
    sessionResult = null;
    await renderTemplateList();
    expect(screen.getByText("Sign in to see your templates.")).toBeInTheDocument();
  });

  it("shows an empty state when there are no templates", async () => {
    await renderTemplateList();
    expect(screen.getByText("No templates uploaded yet.")).toBeInTheDocument();
  });

  it("lists templates with their field breakdown and filename", async () => {
    rowsResult = [
      makeTemplate({ id: "t1", name: "Offer Letter", originalFilename: "offer.docx", fields: [] }),
      makeTemplate({
        id: "t2",
        name: "NDA",
        originalFilename: "nda.docx",
        fields: [
          { key: "name", label: "Name", type: "string", params: [] },
          { key: "signed_at", label: "Signed at", type: "date", params: [] },
        ],
      }),
    ];
    totalResult = [{ total: 2 }];

    await renderTemplateList();

    expect(screen.getByText("Offer Letter")).toBeInTheDocument();
    expect(screen.getByText("offer.docx")).toBeInTheDocument();
    expect(screen.getByText("No fields detected")).toBeInTheDocument();

    expect(screen.getByText("NDA")).toBeInTheDocument();
    expect(screen.getByText("nda.docx")).toBeInTheDocument();
    expect(screen.getByText("1 Text")).toBeInTheDocument();
    expect(screen.getByText("1 Date")).toBeInTheDocument();

    const openLinks = screen.getAllByRole("link", { name: "Open" });
    expect(openLinks[0]).toHaveAttribute("href", "/templates/t1");
    expect(openLinks[1]).toHaveAttribute("href", "/templates/t2");
  });

  it("groups fields under their group label as chips", async () => {
    rowsResult = [
      makeTemplate({
        id: "t1",
        fields: [
          {
            key: "person.first_name",
            label: "First name",
            type: "string",
            params: [],
            group: "person",
            groupLabel: "Person",
          },
        ],
      }),
    ];
    totalResult = [{ total: 1 }];

    await renderTemplateList();

    expect(screen.getByText("Person")).toBeInTheDocument();
  });

  it("does not render pagination controls when everything fits on one page", async () => {
    rowsResult = [makeTemplate({})];
    totalResult = [{ total: 1 }];

    await renderTemplateList();

    expect(screen.queryByText(/Page \d+ of \d+/)).not.toBeInTheDocument();
  });

  it("renders pagination controls and disables 'Previous' on the first page", async () => {
    rowsResult = Array.from({ length: 12 }, (_, i) => makeTemplate({ id: `t${i}`, name: `T${i}` }));
    totalResult = [{ total: 30 }];

    await renderTemplateList({ page: 1 });

    expect(screen.getByText("Page 1 of 3")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Previous/ })).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByRole("link", { name: /Next/ })).toHaveAttribute("href", "?page=2");
  });

  it("disables 'Next' on the last page", async () => {
    rowsResult = Array.from({ length: 6 }, (_, i) => makeTemplate({ id: `t${i}`, name: `T${i}` }));
    totalResult = [{ total: 30 }];

    await renderTemplateList({ page: 3 });

    expect(screen.getByText("Page 3 of 3")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Next/ })).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByRole("link", { name: /Previous/ })).toHaveAttribute("href", "?page=2");
  });
});
