import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FillForm } from "@/components/fill-form";
import type { TemplateField } from "@/db/schema";

const FIELDS: TemplateField[] = [
  { key: "full_name", label: "Full name", type: "string", params: [] },
  { key: "salary", label: "Salary", type: "number", params: ["2"] },
  { key: "start_date", label: "Start date", type: "date", params: [] },
  { key: "relocation", label: "Relocation", type: "boolean", params: ["Yes", "No"] },
  {
    key: "employment_type",
    label: "Employment type",
    type: "select",
    params: ["Full-time", "Part-time"],
  },
  { key: "person.first_name", label: "First name", type: "string", params: [], group: "person", groupLabel: "Person" },
];

function fetchOkBlob(content = "pdf-bytes") {
  return {
    ok: true,
    json: async () => ({}),
    blob: async () => new Blob([content], { type: "application/pdf" }),
  };
}

describe("FillForm / SingleFillForm", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(fetchOkBlob()));
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

  it("renders every field with its label, raw tag, and type, grouping fields under a fieldset", () => {
    render(<FillForm templateId="t1" fields={FIELDS} templateName="Offer Letter" />);

    expect(screen.getByText("Full name")).toBeInTheDocument();
    expect(screen.getByText("{{salary|number(2)}}")).toBeInTheDocument();
    expect(screen.getByText("Person")).toBeInTheDocument();

    const group = screen.getByText("Person").closest("fieldset")!;
    expect(within(group).getByText("First name")).toBeInTheDocument();
  });

  it("renders the correct input type per field", () => {
    render(<FillForm templateId="t1" fields={FIELDS} templateName="Offer Letter" />);

    expect(screen.getByLabelText(/Salary/)).toHaveAttribute("type", "number");
    expect(screen.getByLabelText(/Start date/)).toHaveAttribute("type", "date");
    expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "false");
    expect(screen.getByRole("combobox", { name: /Employment type/ })).toBeInTheDocument();
  });

  it("fetches a preview shortly after mount with the default values", async () => {
    render(<FillForm templateId="t1" fields={FIELDS} templateName="Offer Letter" />);

    await waitFor(
      () =>
        expect(globalThis.fetch).toHaveBeenCalledWith(
          "/api/templates/t1/generate",
          expect.objectContaining({
            method: "POST",
            body: expect.stringContaining('"preview":true'),
          })
        ),
      { timeout: 2000 }
    );
  }, 10000);

  it("debounces the preview request while the user is still typing", async () => {
    const user = userEvent.setup();
    render(<FillForm templateId="t1" fields={FIELDS} templateName="Offer Letter" />);
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledTimes(1), { timeout: 2000 });
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockClear();

    await user.type(screen.getByLabelText(/Full name/), "Jo");

    // Debounce window (700ms) hasn't elapsed yet.
    await new Promise((r) => setTimeout(r, 300));
    expect(globalThis.fetch).not.toHaveBeenCalled();

    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledTimes(1), { timeout: 2000 });
    const [, options] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(JSON.parse(options.body).data.full_name).toBe("Jo");
  }, 10000);

  it("toggles the boolean switch and reflects the on/off label", async () => {
    const user = userEvent.setup();
    render(<FillForm templateId="t1" fields={FIELDS} templateName="Offer Letter" />);

    const toggle = screen.getByRole("switch");
    expect(screen.getByText("No")).toBeInTheDocument();

    await user.click(toggle);

    expect(toggle).toHaveAttribute("aria-checked", "true");
    expect(screen.getByText("Yes")).toBeInTheDocument();
  });

  it("submits field values and triggers a PDF download", async () => {
    const user = userEvent.setup();
    render(<FillForm templateId="t1" fields={FIELDS} templateName="Offer Letter" />);

    await user.type(screen.getByLabelText(/Full name/), "Jane Doe");
    await user.type(screen.getByLabelText(/Salary/), "1000");
    await user.type(screen.getByLabelText(/Start date/), "2026-03-05");
    await user.selectOptions(screen.getByRole("combobox", { name: /Employment type/ }), "Full-time");
    await user.type(screen.getByLabelText(/First name/), "Jane");

    const clickSpy = vi.fn();
    const originalCreateElement = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
      const el = originalCreateElement(tag);
      if (tag === "a") el.click = clickSpy;
      return el;
    });

    await user.click(screen.getByRole("button", { name: "Download PDF" }));
    await waitFor(() => expect(clickSpy).toHaveBeenCalled(), { timeout: 2000 });

    const submitCall = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.find(
      ([, options]) => !JSON.parse(options.body).preview
    );
    expect(submitCall).toBeDefined();
    const body = JSON.parse(submitCall![1].body);
    expect(body.data.full_name).toBe("Jane Doe");

    vi.restoreAllMocks();
  }, 10000);

  it("shows an error message when PDF generation fails", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockImplementation((_url, options) => {
      const body = options?.body ? JSON.parse(options.body as string) : {};
      if (body.preview) return Promise.resolve(fetchOkBlob());
      return Promise.resolve({ ok: false, json: async () => ({ error: "Missing values for: full_name" }) });
    });
    const user = userEvent.setup();
    render(<FillForm templateId="t1" fields={FIELDS} templateName="Offer Letter" />);

    await user.type(screen.getByLabelText(/Full name/), "Jane Doe");
    await user.type(screen.getByLabelText(/Salary/), "1000");
    await user.type(screen.getByLabelText(/Start date/), "2026-03-05");
    await user.selectOptions(screen.getByRole("combobox", { name: /Employment type/ }), "Full-time");
    await user.type(screen.getByLabelText(/First name/), "Jane");

    await user.click(screen.getByRole("button", { name: "Download PDF" }));

    expect(await screen.findByText("Missing values for: full_name")).toBeInTheDocument();
  }, 10000);

  it("persists entered values to localStorage and restores them on remount", async () => {
    const user = userEvent.setup();
    localStorage.clear();
    const { unmount } = render(<FillForm templateId="t1" fields={FIELDS} templateName="Offer Letter" />);

    await user.type(screen.getByLabelText(/Full name/), "Jane Doe");
    await waitFor(() =>
      expect(JSON.parse(localStorage.getItem("fillFormValues:t1")!).full_name).toBe("Jane Doe")
    );

    unmount();

    render(<FillForm templateId="t1" fields={FIELDS} templateName="Offer Letter" />);
    expect(await screen.findByLabelText(/Full name/)).toHaveValue("Jane Doe");
  });

  it("exports the current values as a downloadable JSON file", async () => {
    const user = userEvent.setup();
    render(<FillForm templateId="t1" fields={FIELDS} templateName="Offer Letter" />);

    await user.type(screen.getByLabelText(/Full name/), "Jane Doe");

    const clickSpy = vi.fn();
    const originalCreateElement = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
      const el = originalCreateElement(tag);
      if (tag === "a") el.click = clickSpy;
      return el;
    });

    await user.click(screen.getByRole("button", { name: "Export values" }));

    expect(clickSpy).toHaveBeenCalled();
    expect(URL.createObjectURL).toHaveBeenCalledWith(
      expect.objectContaining({ type: "application/json" })
    );

    vi.restoreAllMocks();
  });

  it("imports values from a JSON file, ignoring unknown keys", async () => {
    const user = userEvent.setup();
    render(<FillForm templateId="t1" fields={FIELDS} templateName="Offer Letter" />);

    const file = new File(
      [JSON.stringify({ full_name: "Jane Doe", unknown_key: "nope" })],
      "values.json",
      { type: "application/json" }
    );

    await user.click(screen.getByRole("button", { name: "Import values" }));
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, file);

    expect(await screen.findByLabelText(/Full name/)).toHaveValue("Jane Doe");
  });

  it("shows an error when importing an invalid values file", async () => {
    const user = userEvent.setup();
    render(<FillForm templateId="t1" fields={FIELDS} templateName="Offer Letter" />);

    const file = new File(["not json"], "values.json", { type: "application/json" });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, file);

    expect(await screen.findByText(/Failed to import values/)).toBeInTheDocument();
  });

  it("switches to the bulk-fill tab", async () => {
    const user = userEvent.setup();
    render(<FillForm templateId="t1" fields={FIELDS} templateName="Offer Letter" />);

    await user.click(screen.getByRole("button", { name: "Create multiple from a spreadsheet" }));

    expect(screen.getByLabelText(/Spreadsheet \(\.csv/)).toBeInTheDocument();
  });
});
