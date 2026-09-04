import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FieldInput } from "@/components/field-input";
import type { TemplateField } from "@/db/schema";

function field(overrides: Partial<TemplateField>): TemplateField {
  return { key: "key", label: "Key", type: "string", params: [], ...overrides };
}

describe("FieldInput", () => {
  it("renders a textarea for the textarea type", () => {
    render(<FieldInput field={field({ type: "textarea" })} value="" onChange={vi.fn()} aria-label="Key" />);
    expect(screen.getByLabelText("Key").tagName).toBe("TEXTAREA");
  });

  it("renders an email input for the email type", () => {
    render(<FieldInput field={field({ type: "email" })} value="" onChange={vi.fn()} aria-label="Key" />);
    expect(screen.getByLabelText("Key")).toHaveAttribute("type", "email");
  });

  it("renders a url input for the url type", () => {
    render(<FieldInput field={field({ type: "url" })} value="" onChange={vi.fn()} aria-label="Key" />);
    expect(screen.getByLabelText("Key")).toHaveAttribute("type", "url");
  });

  it("renders a number input for the currency type", () => {
    render(
      <FieldInput
        field={field({ type: "currency", params: ["$", "2"] })}
        value=""
        onChange={vi.fn()}
        aria-label="Key"
      />
    );
    expect(screen.getByLabelText("Key")).toHaveAttribute("type", "number");
  });

  it("calls onChange with the typed value for a textarea field", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<FieldInput field={field({ type: "textarea" })} value="" onChange={onChange} aria-label="Key" />);

    await user.type(screen.getByLabelText("Key"), "Hi");

    expect(onChange).toHaveBeenCalledWith("H");
    expect(onChange).toHaveBeenCalledWith("i");
  });
});
