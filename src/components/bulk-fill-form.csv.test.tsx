import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BulkFillForm } from "@/components/bulk-fill-form";
import { orpc } from "@/lib/orpc";
import {
  csvFile,
  FIELDS,
  installBulkFillGlobals,
  restoreBulkFillGlobals,
  spyOnAnchorClick,
} from "./bulk-fill-form.test-helpers";

vi.mock("@/lib/orpc");

const HEADER_ROW = "Full name ({{full_name}}),Relocation ({{relocation|boolean}})";

describe("BulkFillForm — CSV upload", () => {
  beforeEach(installBulkFillGlobals);
  afterEach(restoreBulkFillGlobals);

  it("shows a placeholder until a CSV is uploaded", () => {
    render(<BulkFillForm templateId="t1" fields={FIELDS} templateName="Offer Letter" />);
    expect(
      screen.getByText("Upload a .csv file with one row per document to get started.")
    ).toBeInTheDocument();
  });

  it("parses an uploaded CSV, auto-maps matching headers, and previews the rows", async () => {
    const user = userEvent.setup();
    render(<BulkFillForm templateId="t1" fields={FIELDS} templateName="Offer Letter" />);

    const file = csvFile(`${HEADER_ROW}\nJane Doe,true\nJohn Roe,false\n`);
    await user.upload(screen.getByLabelText(/Spreadsheet \(\.csv/), file);

    expect(await screen.findByText("data.csv — 2 rows")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Jane Doe")).toBeInTheDocument();
    expect(screen.getByDisplayValue("John Roe")).toBeInTheDocument();

    const fullNameMapping = screen.getByLabelText(/^Full name$/) as HTMLSelectElement;
    expect(fullNameMapping.value).toBe("Full name ({{full_name}})");
  });

  it("allows editing values from an uploaded CSV directly in the table", async () => {
    const user = userEvent.setup();
    render(<BulkFillForm templateId="t1" fields={FIELDS} templateName="Offer Letter" />);

    await user.upload(
      screen.getByLabelText(/Spreadsheet \(\.csv/),
      csvFile(`${HEADER_ROW}\nJane Doe,true\n`)
    );
    await screen.findByText("data.csv — 1 row");

    const cell = screen.getByDisplayValue("Jane Doe");
    await user.clear(cell);
    await user.type(cell, "Jane Smith");

    await user.click(screen.getByRole("button", { name: "+ Add row" }));
    expect(screen.getByRole("button", { name: "Generate 2 documents" })).toBeInTheDocument();
    expect(await screen.findByText("data.csv — 2 rows")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Jane Smith")).toBeInTheDocument();
  });

  it("shows a parse error for a file with no rows", async () => {
    const user = userEvent.setup();
    render(<BulkFillForm templateId="t1" fields={FIELDS} templateName="Offer Letter" />);

    await user.upload(screen.getByLabelText(/Spreadsheet \(\.csv/), csvFile(""));

    expect(
      await screen.findByText(
        "Couldn't find any rows in that file. Make sure the first row has column headers."
      )
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
    const clickSpy = spyOnAnchorClick();

    render(<BulkFillForm templateId="t1" fields={FIELDS} templateName="Offer Letter" />);
    await user.click(screen.getByRole("button", { name: "Download CSV template" }));

    expect(clickSpy).toHaveBeenCalled();
    expect(globalThis.URL.createObjectURL).toHaveBeenCalled();
    vi.restoreAllMocks();
  });

  it("previews a specific row using the mapped values", async () => {
    const user = userEvent.setup();
    render(<BulkFillForm templateId="t1" fields={FIELDS} templateName="Offer Letter" />);

    await user.upload(
      screen.getByLabelText(/Spreadsheet \(\.csv/),
      csvFile(`${HEADER_ROW}\nJane Doe,true\nJohn Roe,false\n`)
    );
    await screen.findByText("data.csv — 2 rows");

    await user.click(screen.getByRole("button", { name: "Preview" }));

    await waitFor(() => expect(orpc.templates.generate).toHaveBeenCalledTimes(1));
    const [input] = vi.mocked(orpc.templates.generate).mock.calls[0];
    expect((input as { preview?: boolean }).preview).toBe(true);
    expect((input as { data: unknown }).data).toEqual({
      full_name: "Jane Doe",
      relocation: "true",
    });
  });

  it("returns to the editable table from the preview via 'Back to editing'", async () => {
    const user = userEvent.setup();
    render(<BulkFillForm templateId="t1" fields={FIELDS} templateName="Offer Letter" />);

    await user.upload(
      screen.getByLabelText(/Spreadsheet \(\.csv/),
      csvFile(`${HEADER_ROW}\nJane Doe,true\n`)
    );
    await screen.findByText("data.csv — 1 row");

    await user.click(screen.getByRole("button", { name: "Preview" }));
    await screen.findByTitle("Document preview");
    expect(screen.queryByDisplayValue("Jane Doe")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "← Back to editing" }));

    expect(screen.queryByTitle("Document preview")).not.toBeInTheDocument();
    expect(screen.getByDisplayValue("Jane Doe")).toBeInTheDocument();
  });

  it("downloads the current (possibly edited) CSV rows", async () => {
    const user = userEvent.setup();
    render(<BulkFillForm templateId="t1" fields={FIELDS} templateName="Offer Letter" />);

    await user.upload(
      screen.getByLabelText(/Spreadsheet \(\.csv/),
      csvFile(`${HEADER_ROW}\nJane Doe,true\n`)
    );
    await screen.findByText("data.csv — 1 row");

    const nameInput = screen.getByDisplayValue("Jane Doe");
    await user.clear(nameInput);
    await user.type(nameInput, "Jane Updated");

    await user.click(screen.getByRole("button", { name: "Download rows as CSV" }));

    const createObjectURL = globalThis.URL.createObjectURL as ReturnType<typeof vi.fn>;
    const blob = createObjectURL.mock.calls.at(-1)?.[0] as Blob;
    expect(await blob.text()).toBe(`${HEADER_ROW}\nJane Updated,true\n`);
  });
});
