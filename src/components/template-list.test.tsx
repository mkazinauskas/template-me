import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { Template } from "@/db/schema";

let rowsResult: Template[] = [];
let totalResult: { total: number }[] = [{ total: 0 }];

vi.mock("@/db", () => ({
  getDb: () => ({
    select(arg?: unknown) {
      const isCountQuery = arg !== undefined;
      const builder = {
        from: () => builder,
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

function makeTemplate(overrides: Partial<Template>): Template {
  return {
    id: "id-1",
    name: "Offer Letter",
    originalFilename: "offer.docx",
    blobUrl: "https://blob/offer.docx",
    blobPathname: "templates/offer.docx",
    fields: [],
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
  });

  it("shows an empty state when there are no templates", async () => {
    await renderTemplateList();
    expect(screen.getByText("No templates uploaded yet.")).toBeInTheDocument();
  });

  it("lists templates with their field count and filename", async () => {
    rowsResult = [
      makeTemplate({ id: "t1", name: "Offer Letter", originalFilename: "offer.docx", fields: [] }),
      makeTemplate({
        id: "t2",
        name: "NDA",
        originalFilename: "nda.docx",
        fields: [{ key: "name", label: "Name", type: "string", params: [] }],
      }),
    ];
    totalResult = [{ total: 2 }];

    await renderTemplateList();

    expect(screen.getByText("Offer Letter")).toBeInTheDocument();
    expect(screen.getByText("0 fields · offer.docx")).toBeInTheDocument();
    expect(screen.getByText("NDA")).toBeInTheDocument();
    expect(screen.getByText("1 field · nda.docx")).toBeInTheDocument();

    expect(screen.getByRole("link", { name: /Offer Letter/ })).toHaveAttribute(
      "href",
      "/templates/t1"
    );
  });

  it("does not render pagination controls when everything fits on one page", async () => {
    rowsResult = [makeTemplate({})];
    totalResult = [{ total: 1 }];

    await renderTemplateList();

    expect(screen.queryByText(/Page \d+ of \d+/)).not.toBeInTheDocument();
  });

  it("renders pagination controls and disables 'Previous' on the first page", async () => {
    rowsResult = Array.from({ length: 10 }, (_, i) => makeTemplate({ id: `t${i}`, name: `T${i}` }));
    totalResult = [{ total: 25 }];

    await renderTemplateList({ page: 1 });

    expect(screen.getByText("Page 1 of 3")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Previous/ })).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByRole("link", { name: /Next/ })).toHaveAttribute("href", "?page=2");
  });

  it("disables 'Next' on the last page", async () => {
    rowsResult = Array.from({ length: 5 }, (_, i) => makeTemplate({ id: `t${i}`, name: `T${i}` }));
    totalResult = [{ total: 25 }];

    await renderTemplateList({ page: 3 });

    expect(screen.getByText("Page 3 of 3")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Next/ })).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByRole("link", { name: /Previous/ })).toHaveAttribute("href", "?page=2");
  });
});
