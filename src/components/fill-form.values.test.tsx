import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FillForm } from "@/components/fill-form";
import {
  fetchOkBlob,
  FIELDS,
  installFillFormGlobals,
  restoreFillFormGlobals,
  spyOnAnchorClick,
} from "./fill-form.test-helpers";

describe("FillForm — submit, persistence & values import/export", () => {
  beforeEach(installFillFormGlobals);
  afterEach(restoreFillFormGlobals);

  it("submits field values and triggers a PDF download", async () => {
    const user = userEvent.setup();
    render(<FillForm templateId="t1" fields={FIELDS} templateName="Offer Letter" />);

    await user.type(screen.getByLabelText(/Full name/), "Jane Doe");
    await user.type(screen.getByLabelText(/Salary/), "1000");
    await user.type(screen.getByLabelText(/Start date/), "2026-03-05");
    await user.selectOptions(screen.getByRole("combobox", { name: /Employment type/ }), "Full-time");
    await user.type(screen.getByLabelText(/First name/), "Jane");

    const clickSpy = spyOnAnchorClick();

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
      return Promise.resolve({
        ok: false,
        json: async () => ({ error: "Missing values for: full_name" }),
      });
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
    const { unmount } = render(
      <FillForm templateId="t1" fields={FIELDS} templateName="Offer Letter" />
    );

    await user.type(screen.getByLabelText(/Full name/), "Jane Doe");
    await user.type(screen.getByLabelText(/Salary/), "1000");
    await user.type(screen.getByLabelText(/Start date/), "2026-03-05");
    await user.click(screen.getByRole("switch"));
    await user.selectOptions(screen.getByRole("combobox", { name: /Employment type/ }), "Full-time");
    await waitFor(() => {
      const stored = JSON.parse(localStorage.getItem("fillFormValues:t1")!);
      expect(stored.full_name).toBe("Jane Doe");
      expect(stored.salary).toBe("1000");
      expect(stored.start_date).toBe("2026-03-05");
      expect(stored.relocation).toBe("true");
      expect(stored.employment_type).toBe("Full-time");
    });

    unmount();

    render(<FillForm templateId="t1" fields={FIELDS} templateName="Offer Letter" />);
    expect(await screen.findByLabelText(/Full name/)).toHaveValue("Jane Doe");
    expect(screen.getByLabelText(/Salary/)).toHaveValue(1000);
    expect(screen.getByLabelText(/Start date/)).toHaveValue("2026-03-05");
    expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("combobox", { name: /Employment type/ })).toHaveValue("Full-time");
  });

  it("writes each edit to localStorage immediately, with no debounce or delay", () => {
    render(<FillForm templateId="t1" fields={FIELDS} templateName="Offer Letter" />);

    // Plain fireEvent with no `await`/`waitFor` afterwards: the write must land
    // in the same tick as the edit (values are persisted directly in the change
    // handler rather than in a debounced/deferred effect), so a refresh right
    // after typing can never race ahead of the save.
    fireEvent.change(screen.getByLabelText(/Full name/), { target: { value: "Jane" } });
    expect(JSON.parse(localStorage.getItem("fillFormValues:t1")!).full_name).toBe("Jane");

    fireEvent.click(screen.getByRole("switch"));
    expect(JSON.parse(localStorage.getItem("fillFormValues:t1")!).relocation).toBe("true");
  });

  it("exports the current values as a downloadable JSON file", async () => {
    const user = userEvent.setup();
    render(<FillForm templateId="t1" fields={FIELDS} templateName="Offer Letter" />);

    await user.type(screen.getByLabelText(/Full name/), "Jane Doe");

    const clickSpy = spyOnAnchorClick();

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

  it("clears all field values back to their defaults", async () => {
    const user = userEvent.setup();
    render(<FillForm templateId="t1" fields={FIELDS} templateName="Offer Letter" />);

    await user.type(screen.getByLabelText(/Full name/), "Jane Doe");
    await user.type(screen.getByLabelText(/Salary/), "1000");
    await user.click(screen.getByRole("switch"));

    await user.click(screen.getByRole("button", { name: "Clear values" }));

    expect(screen.getByLabelText(/Full name/)).toHaveValue("");
    expect(screen.getByLabelText(/Salary/)).toHaveValue(null);
    expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "false");
  });
});
