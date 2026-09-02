import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BulkFillForm } from "@/components/bulk-fill-form";
import type { TemplateField } from "@/db/schema";
import {
  csvFile,
  FIELDS,
  installBulkFillGlobals,
  restoreBulkFillGlobals,
  spyOnAnchorClick,
} from "./bulk-fill-form.test-helpers";

const HEADER_ROW = "Full name ({{full_name}}),Relocation ({{relocation|boolean}})";
const mockFetch = () => globalThis.fetch as ReturnType<typeof vi.fn>;

describe("BulkFillForm — edit-in-page & generation", () => {
  beforeEach(installBulkFillGlobals);
  afterEach(restoreBulkFillGlobals);

  it("generates all documents and downloads the resulting zip", async () => {
    mockFetch().mockResolvedValue({
      ok: true,
      blob: async () => new Blob(["zip"], { type: "application/zip" }),
    });
    const clickSpy = spyOnAnchorClick();

    const user = userEvent.setup();
    render(<BulkFillForm templateId="t1" fields={FIELDS} templateName="Offer Letter" />);

    await user.upload(
      screen.getByLabelText(/Spreadsheet \(\.csv/),
      csvFile(`${HEADER_ROW}\nJane Doe,true\nJohn Roe,false\n`)
    );
    await screen.findByText("data.csv — 2 rows");

    await user.click(screen.getByRole("button", { name: "Generate 2 documents" }));

    await waitFor(() => expect(clickSpy).toHaveBeenCalled());
    const [, options] = mockFetch().mock.calls[0];
    const body = JSON.parse(options.body);
    expect(body.rows).toHaveLength(2);
    expect(body.rows[0].data.full_name).toBe("Jane Doe");
    vi.restoreAllMocks();
  });

  it("switches to the in-page edit view with one empty row and allows adding/removing rows", async () => {
    const user = userEvent.setup();
    render(<BulkFillForm templateId="t1" fields={FIELDS} templateName="Offer Letter" />);

    await user.click(screen.getByRole("button", { name: "Edit in page" }));

    expect(screen.getByRole("button", { name: "Generate 1 document" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "+ Add row" }));
    expect(screen.getByRole("button", { name: "Generate 2 documents" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Remove row 2" }));
    expect(screen.getByRole("button", { name: "Generate 1 document" })).toBeInTheDocument();
  });

  it("renders a checkbox input in edit mode and includes its checked state when previewing", async () => {
    mockFetch().mockResolvedValue({
      ok: true,
      blob: async () => new Blob(["pdf"], { type: "application/pdf" }),
    });
    const checkboxFields: TemplateField[] = [
      { key: "full_name", label: "Full name", type: "string", params: [] },
      { key: "agreed", label: "Agreed", type: "checkbox", params: [] },
    ];
    const user = userEvent.setup();
    render(<BulkFillForm templateId="t1" fields={checkboxFields} templateName="Offer Letter" />);

    await user.click(screen.getByRole("button", { name: "Edit in page" }));
    await user.type(screen.getByRole("textbox", { name: "Full name" }), "Jane Doe");

    const checkbox = screen.getByRole("checkbox", { name: "Agreed" });
    expect(checkbox).not.toBeChecked();
    await user.click(checkbox);
    expect(checkbox).toBeChecked();

    await user.click(screen.getByRole("button", { name: "Preview" }));

    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledTimes(1));
    const [, options] = mockFetch().mock.calls[0];
    const body = JSON.parse(options.body);
    expect(body.data).toEqual({ full_name: "Jane Doe", agreed: "true" });
  });

  it("generates documents from manually entered rows", async () => {
    mockFetch().mockResolvedValue({
      ok: true,
      blob: async () => new Blob(["zip"], { type: "application/zip" }),
    });
    const clickSpy = spyOnAnchorClick();

    const user = userEvent.setup();
    render(<BulkFillForm templateId="t1" fields={FIELDS} templateName="Offer Letter" />);

    await user.click(screen.getByRole("button", { name: "Edit in page" }));
    await user.type(screen.getByRole("textbox", { name: "Full name" }), "Jane Doe");

    await user.click(screen.getByRole("button", { name: "Generate 1 document" }));

    await waitFor(() => expect(clickSpy).toHaveBeenCalled());
    const [, options] = mockFetch().mock.calls[0];
    const body = JSON.parse(options.body);
    expect(body.rows).toHaveLength(1);
    expect(body.rows[0].data).toEqual({ full_name: "Jane Doe", relocation: "false" });
    vi.restoreAllMocks();
  });

  it("shows an error message when bulk generation fails", async () => {
    mockFetch().mockResolvedValue({ ok: false, json: async () => ({ error: "Too many rows" }) });
    const user = userEvent.setup();
    render(<BulkFillForm templateId="t1" fields={FIELDS} templateName="Offer Letter" />);

    await user.upload(
      screen.getByLabelText(/Spreadsheet \(\.csv/),
      csvFile(`${HEADER_ROW}\nJane Doe,true\n`)
    );
    await screen.findByText("data.csv — 1 row");

    await user.click(screen.getByRole("button", { name: "Generate 1 document" }));

    expect(await screen.findByText("Too many rows")).toBeInTheDocument();
  });

  it("persists uploaded rows and edits to localStorage and restores them on remount", async () => {
    const user = userEvent.setup();
    const { unmount } = render(
      <BulkFillForm templateId="t1" fields={FIELDS} templateName="Offer Letter" />
    );

    await user.upload(
      screen.getByLabelText(/Spreadsheet \(\.csv/),
      csvFile(`${HEADER_ROW}\nJane Doe,true\n`)
    );
    await screen.findByText("data.csv — 1 row");

    const nameInput = screen.getByDisplayValue("Jane Doe");
    await user.clear(nameInput);
    await user.type(nameInput, "Jane Updated");

    await waitFor(() =>
      expect(
        JSON.parse(localStorage.getItem("bulkFillState:t1")!).csvRows[0]["Full name ({{full_name}})"]
      ).toBe("Jane Updated")
    );

    unmount();
    render(<BulkFillForm templateId="t1" fields={FIELDS} templateName="Offer Letter" />);

    expect(await screen.findByText("data.csv — 1 row")).toBeInTheDocument();
    expect(await screen.findByDisplayValue("Jane Updated")).toBeInTheDocument();
  });

  it("downloads manually entered rows as CSV, headed by each field's raw tag", async () => {
    const user = userEvent.setup();
    render(<BulkFillForm templateId="t1" fields={FIELDS} templateName="Offer Letter" />);

    await user.click(screen.getByRole("button", { name: "Edit in page" }));
    await user.type(screen.getByRole("textbox", { name: "Full name" }), "Jane Doe");

    await user.click(screen.getByRole("button", { name: "Download rows as CSV" }));

    const createObjectURL = globalThis.URL.createObjectURL as ReturnType<typeof vi.fn>;
    const blob = createObjectURL.mock.calls.at(-1)?.[0] as Blob;
    expect(await blob.text()).toBe(
      '{{full_name}},"{{relocation|boolean(""Yes"", ""No"")}}"\nJane Doe,false\n'
    );
  });
});
