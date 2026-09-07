import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { FillRequest, TemplateField } from "@/db/schema";
import { FillRequestsPanel } from "@/components/fill-form/fill-requests-panel";
import { orpc } from "@/lib/orpc";

vi.mock("@/lib/orpc");

const fields: TemplateField[] = [
  { key: "full_name", label: "Full name", type: "string", params: [] },
  { key: "email", label: "Email", type: "email", params: [] },
  { key: "person.city", label: "City", type: "string", params: [], group: "person", groupLabel: "Person" },
];

beforeEach(() => {
  vi.mocked(orpc.fillRequests.list).mockReset().mockResolvedValue({ fillRequests: [] } as never);
  vi.mocked(orpc.fillRequests.create).mockReset().mockResolvedValue({} as never);
});

function renderPanel() {
  return render(<FillRequestsPanel templateId="tpl-1" templateName="Contract" fields={fields} />);
}

/** Clicks "New link" and waits for the picker to come up. */
async function openDialog(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole("button", { name: /new link/i }));
  return await screen.findByRole("dialog");
}

describe("NewFillLinkDialog", () => {
  it("asks which questions to include instead of creating a link straight away", async () => {
    const user = userEvent.setup();
    renderPanel();

    await openDialog(user);
    expect(orpc.fillRequests.create).not.toHaveBeenCalled();
    // Every field is listed, grouped ones under their group heading.
    expect(screen.getByRole("checkbox", { name: /full name/i })).toBeChecked();
    expect(screen.getByText("Person")).toBeInTheDocument();
  });

  it("sends only the checked fields, in template order", async () => {
    const user = userEvent.setup();
    renderPanel();
    await openDialog(user);

    await user.click(screen.getByRole("checkbox", { name: /full name/i }));
    await user.click(screen.getByRole("button", { name: /create link/i }));

    expect(orpc.fillRequests.create).toHaveBeenCalledWith({
      templateId: "tpl-1",
      fieldKeys: ["email", "person.city"],
      title: "",
      message: "",
    });
  });

  it("sends the owner's title and message along with the selection", async () => {
    const user = userEvent.setup();
    renderPanel();
    await openDialog(user);

    await user.type(screen.getByLabelText(/title/i), "Onboarding details");
    await user.type(screen.getByLabelText(/message/i), "Please use your legal name.");
    await user.click(screen.getByRole("button", { name: /create link/i }));

    expect(orpc.fillRequests.create).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Onboarding details",
        message: "Please use your legal name.",
      })
    );
  });

  it("won't create a link with nothing on it", async () => {
    const user = userEvent.setup();
    renderPanel();
    await openDialog(user);

    await user.click(screen.getByRole("button", { name: /clear all/i }));
    expect(screen.getByRole("button", { name: /create link/i })).toBeDisabled();
    expect(screen.getByText(/pick at least one question/i)).toBeInTheDocument();
  });

  it("closes on Cancel without creating anything", async () => {
    const user = userEvent.setup();
    renderPanel();
    await openDialog(user);

    await user.click(screen.getByRole("button", { name: /^cancel$/i }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(orpc.fillRequests.create).not.toHaveBeenCalled();
  });

  it("keeps the dialog open and shows why when the create fails", async () => {
    vi.mocked(orpc.fillRequests.create).mockRejectedValue(new Error("Template is gone"));
    const user = userEvent.setup();
    renderPanel();
    await openDialog(user);

    await user.click(screen.getByRole("button", { name: /create link/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Template is gone");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});

describe("pending link rows", () => {
  it("summarises what each link asks for and shows the owner's title", async () => {
    vi.mocked(orpc.fillRequests.list).mockResolvedValue({
      fillRequests: [
        {
          id: "req-1",
          templateId: "tpl-1",
          code: "abc123",
          fieldKeys: ["email"],
          title: "Onboarding details",
          message: null,
          data: null,
          createdAt: new Date("2026-01-01T10:00:00Z"),
          filledAt: null,
          revokedAt: null,
        } as unknown as FillRequest,
      ],
    } as never);
    renderPanel();

    expect(await screen.findByText("Onboarding details")).toBeInTheDocument();
    expect(screen.getByText(/asks for 1 of 3 questions/i)).toBeInTheDocument();
  });
});
