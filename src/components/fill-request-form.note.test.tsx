import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { TemplateField } from "@/db/schema";
import { FillRequestForm } from "@/components/fill-request-form";

vi.mock("@/lib/orpc");

const fields: TemplateField[] = [{ key: "email", label: "Email", type: "email", params: [] }];

describe("FillRequestForm — the owner's own title and note", () => {
  it("falls back to the template's name when the owner wrote no title", () => {
    render(<FillRequestForm code="abc" templateName="Offer Letter" fields={fields} />);
    expect(screen.getByRole("heading", { name: "Offer Letter" })).toBeInTheDocument();
  });

  it("shows the owner's title in place of the template name, and their message", () => {
    render(
      <FillRequestForm
        code="abc"
        templateName="Offer Letter"
        fields={fields}
        title="Onboarding details"
        message="Use the address you check daily."
      />
    );
    expect(screen.getByRole("heading", { name: "Onboarding details" })).toBeInTheDocument();
    expect(screen.getByText("Use the address you check daily.")).toBeInTheDocument();
    expect(screen.queryByText("Offer Letter")).not.toBeInTheDocument();
  });

  it("only asks for the fields the link carries", () => {
    render(<FillRequestForm code="abc" templateName="Offer Letter" fields={fields} />);
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/full name/i)).not.toBeInTheDocument();
  });

  it("labels each question with nothing but its label — no raw tag, no type", () => {
    render(<FillRequestForm code="abc" templateName="Offer Letter" fields={fields} />);
    expect(screen.getByText("Email").textContent).toBe("Email");
    expect(screen.queryByText(/\{\{/)).not.toBeInTheDocument();
    expect(screen.queryByText(/^email$/i, { selector: "span" })).not.toBeInTheDocument();
  });
});
