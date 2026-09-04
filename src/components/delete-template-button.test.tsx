import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DeleteTemplateButton } from "@/components/delete-template-button";
import { orpc } from "@/lib/orpc";

vi.mock("@/lib/orpc");

const push = vi.fn();
const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh }),
}));

describe("DeleteTemplateButton", () => {
  beforeEach(() => {
    push.mockReset();
    refresh.mockReset();
    vi.mocked(orpc.templates.delete).mockReset().mockResolvedValue({ ok: true });
  });

  it("asks for confirmation before deleting and does nothing when cancelled", async () => {
    const user = userEvent.setup();
    render(<DeleteTemplateButton templateId="abc" />);

    await user.click(screen.getByRole("button", { name: "Delete" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(orpc.templates.delete).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument();
  });

  it("deletes the template and navigates to the dashboard on success", async () => {
    const user = userEvent.setup();
    render(<DeleteTemplateButton templateId="abc" />);

    await user.click(screen.getByRole("button", { name: "Delete" }));
    await user.click(screen.getByRole("button", { name: "Confirm delete" }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/client/dashboard"));
    expect(orpc.templates.delete).toHaveBeenCalledWith({ id: "abc" });
    expect(refresh).toHaveBeenCalled();
  });

  it("shows 'Deleting…' while the request is in flight and re-enables on failure", async () => {
    let rejectDelete!: (reason: unknown) => void;
    vi.mocked(orpc.templates.delete).mockReturnValue(
      new Promise((_, reject) => {
        rejectDelete = reject;
      })
    );
    const user = userEvent.setup();
    render(<DeleteTemplateButton templateId="abc" />);

    await user.click(screen.getByRole("button", { name: "Delete" }));
    await user.click(screen.getByRole("button", { name: "Confirm delete" }));
    expect(await screen.findByRole("button", { name: "Deleting…" })).toBeDisabled();

    rejectDelete(new Error("delete failed"));

    const button = await screen.findByRole("button", { name: "Delete" });
    expect(button).not.toBeDisabled();
    expect(push).not.toHaveBeenCalled();
  });
});
