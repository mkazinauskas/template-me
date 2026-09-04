import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FillForm } from "@/components/fill-form";
import { orpc } from "@/lib/orpc";
import {
  FIELDS,
  installFillFormGlobals,
  restoreFillFormGlobals,
} from "./fill-form.test-helpers";

vi.mock("@/lib/orpc");

describe("FillForm — rendering, inputs & preview", () => {
  beforeEach(installFillFormGlobals);
  afterEach(restoreFillFormGlobals);

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

  it("requests a preview shortly after mount with the default values", async () => {
    render(<FillForm templateId="t1" fields={FIELDS} templateName="Offer Letter" />);

    await waitFor(
      () =>
        expect(orpc.templates.generate).toHaveBeenCalledWith(
          expect.objectContaining({ id: "t1", preview: true }),
          expect.objectContaining({ signal: expect.any(AbortSignal) })
        ),
      { timeout: 2000 }
    );
  }, 10000);

  it("debounces the preview request while the user is still typing", async () => {
    const user = userEvent.setup();
    render(<FillForm templateId="t1" fields={FIELDS} templateName="Offer Letter" />);
    await waitFor(() => expect(orpc.templates.generate).toHaveBeenCalledTimes(1), { timeout: 2000 });
    vi.mocked(orpc.templates.generate).mockClear();

    await user.type(screen.getByLabelText(/Full name/), "Jo");

    // Debounce window (700ms) hasn't elapsed yet.
    await new Promise((r) => setTimeout(r, 300));
    expect(orpc.templates.generate).not.toHaveBeenCalled();

    await waitFor(() => expect(orpc.templates.generate).toHaveBeenCalledTimes(1), { timeout: 2000 });
    const [input] = vi.mocked(orpc.templates.generate).mock.calls[0];
    expect((input as { data: Record<string, string> }).data.full_name).toBe("Jo");
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

  it("renders a checkbox input and toggles its checked state", async () => {
    const user = userEvent.setup();
    const checkboxFields = [{ key: "agreed", label: "Agreed", type: "checkbox" as const, params: [] }];
    render(<FillForm templateId="t1" fields={checkboxFields} templateName="Offer Letter" />);

    const checkbox = screen.getByRole("checkbox");
    expect(checkbox).not.toBeChecked();

    await user.click(checkbox);

    expect(checkbox).toBeChecked();
  });

  it("switches to the bulk-fill tab", async () => {
    const user = userEvent.setup();
    render(<FillForm templateId="t1" fields={FIELDS} templateName="Offer Letter" />);

    await user.click(screen.getByRole("button", { name: "Create multiple from a spreadsheet" }));

    expect(screen.getByLabelText(/Spreadsheet \(\.csv/)).toBeInTheDocument();
  });
});
