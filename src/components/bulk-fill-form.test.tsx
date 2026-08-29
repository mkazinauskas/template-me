import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BulkFillForm } from "@/components/bulk-fill-form";
import type { TemplateField } from "@/db/schema";

const FIELDS: TemplateField[] = [
  { key: "full_name", label: "Full name", type: "string", params: [] },
  { key: "relocation", label: "Relocation", type: "boolean", params: ["Yes", "No"] },
];

function csvFile(content: string, name = "data.csv") {
  return new File([content], name, { type: "text/csv" });
}

describe("BulkFillForm", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    vi.stubGlobal(
      "URL",
      Object.assign(URL, {
        createObjectURL: vi.fn(() => "blob:mock-url"),
        revokeObjectURL: vi.fn(),
      })
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows a placeholder until a CSV is uploaded", () => {
    render(<BulkFillForm templateId="t1" fields={FIELDS} templateName="Offer Letter" />);
    expect(
      screen.getByText("Upload a .csv file with one row per document to get started.")
    ).toBeInTheDocument();
  });

  it("parses an uploaded CSV, auto-maps matching headers, and previews the rows", async () => {
    const user = userEvent.setup();
    render(<BulkFillForm templateId="t1" fields={FIELDS} templateName="Offer Letter" />);

    const file = csvFile("Full name ({{full_name}}),Relocation ({{relocation|boolean}})\nJane Doe,true\nJohn Roe,false\n");
    await user.upload(screen.getByLabelText(/Spreadsheet \(\.csv/), file);

    expect(await screen.findByText("data.csv — 2 rows")).toBeInTheDocument();
    expect(screen.getByText("Jane Doe")).toBeInTheDocument();
    expect(screen.getByText("John Roe")).toBeInTheDocument();

    const fullNameMapping = screen.getByLabelText(/^Full name/) as HTMLSelectElement;
    expect(fullNameMapping.value).toBe("Full name ({{full_name}})");
  });

  it("shows a parse error for a file with no rows", async () => {
    const user = userEvent.setup();
    render(<BulkFillForm templateId="t1" fields={FIELDS} templateName="Offer Letter" />);

    await user.upload(screen.getByLabelText(/Spreadsheet \(\.csv/), csvFile(""));

    expect(
      await screen.findByText("Couldn't find any rows in that file. Make sure the first row has column headers.")
    ).toBeInTheDocument();
  });

  it("warns about required fields left unmapped", async () => {
    const user = userEvent.setup();
    render(<BulkFillForm templateId="t1" fields={FIELDS} templateName="Offer Letter" />);

    await user.upload(
      screen.getByLabelText(/Spreadsheet \(\.csv/),
      csvFile("Unrelated column\nvalue\n")
    );

    expect(await screen.findByText(/Not mapped: Full name/)).toBeInTheDocument();
  });

  it("downloads a CSV template with headers and a sample row", async () => {
    const user = userEvent.setup();
    const clickSpy = vi.fn();
    const originalCreateElement = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
      const el = originalCreateElement(tag);
      if (tag === "a") el.click = clickSpy;
      return el;
    });

    render(<BulkFillForm templateId="t1" fields={FIELDS} templateName="Offer Letter" />);
    await user.click(screen.getByRole("button", { name: "Download CSV template" }));

    expect(clickSpy).toHaveBeenCalled();
    expect(globalThis.URL.createObjectURL).toHaveBeenCalled();
    vi.restoreAllMocks();
  });

  it("previews a specific row using the mapped values", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      blob: async () => new Blob(["pdf"], { type: "application/pdf" }),
    });
    const user = userEvent.setup();
    render(<BulkFillForm templateId="t1" fields={FIELDS} templateName="Offer Letter" />);

    await user.upload(
      screen.getByLabelText(/Spreadsheet \(\.csv/),
      csvFile("Full name ({{full_name}}),Relocation ({{relocation|boolean}})\nJane Doe,true\nJohn Roe,false\n")
    );
    await screen.findByText("data.csv — 2 rows");

    await user.click(screen.getByRole("button", { name: "Preview" }));

    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledTimes(1));
    const [, options] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(options.body);
    expect(body.preview).toBe(true);
    expect(body.data).toEqual({ full_name: "Jane Doe", relocation: "true" });
  });

  it("generates all documents and downloads the resulting zip", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      blob: async () => new Blob(["zip"], { type: "application/zip" }),
    });
    const clickSpy = vi.fn();
    const originalCreateElement = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
      const el = originalCreateElement(tag);
      if (tag === "a") el.click = clickSpy;
      return el;
    });

    const user = userEvent.setup();
    render(<BulkFillForm templateId="t1" fields={FIELDS} templateName="Offer Letter" />);

    await user.upload(
      screen.getByLabelText(/Spreadsheet \(\.csv/),
      csvFile("Full name ({{full_name}}),Relocation ({{relocation|boolean}})\nJane Doe,true\nJohn Roe,false\n")
    );
    await screen.findByText("data.csv — 2 rows");

    await user.click(screen.getByRole("button", { name: "Generate 2 documents" }));

    await waitFor(() => expect(clickSpy).toHaveBeenCalled());
    const [, options] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(options.body);
    expect(body.rows).toHaveLength(2);
    expect(body.rows[0].data.full_name).toBe("Jane Doe");
    vi.restoreAllMocks();
  });

  it("shows an error message when bulk generation fails", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      json: async () => ({ error: "Too many rows" }),
    });
    const user = userEvent.setup();
    render(<BulkFillForm templateId="t1" fields={FIELDS} templateName="Offer Letter" />);

    await user.upload(
      screen.getByLabelText(/Spreadsheet \(\.csv/),
      csvFile("Full name ({{full_name}}),Relocation ({{relocation|boolean}})\nJane Doe,true\n")
    );
    await screen.findByText("data.csv — 1 row");

    await user.click(screen.getByRole("button", { name: "Generate 1 document" }));

    expect(await screen.findByText("Too many rows")).toBeInTheDocument();
  });
});
