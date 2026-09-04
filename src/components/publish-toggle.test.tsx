import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PublishToggle } from "@/components/publish-toggle";
import { orpc } from "@/lib/orpc";

vi.mock("@/lib/orpc");

const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh }),
}));

describe("PublishToggle", () => {
  beforeEach(() => {
    refresh.mockReset();
    vi.mocked(orpc.templates.setPublic)
      .mockReset()
      .mockResolvedValue({ template: {} as never });
  });

  it("confirms before calling setPublic:true from a private template", async () => {
    const user = userEvent.setup();
    render(<PublishToggle templateId="abc" isPublic={false} />);

    // Flipping the switch only opens the inline confirm — no request yet.
    await user.click(screen.getByRole("switch", { name: /make template public/i }));
    expect(orpc.templates.setPublic).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: /confirm . make public/i }));

    expect(orpc.templates.setPublic).toHaveBeenCalledWith({ id: "abc", isPublic: true });
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it("cancelling the confirm makes no request", async () => {
    const user = userEvent.setup();
    render(<PublishToggle templateId="abc" isPublic={false} />);

    await user.click(screen.getByRole("switch", { name: /make template public/i }));
    await user.click(screen.getByRole("button", { name: /cancel/i }));

    expect(orpc.templates.setPublic).not.toHaveBeenCalled();
    expect(screen.getByRole("switch", { name: /make template public/i })).toBeInTheDocument();
  });

  it("calls setPublic:false immediately from a public template (no confirm)", async () => {
    const user = userEvent.setup();
    render(<PublishToggle templateId="abc" isPublic={true} />);

    await user.click(screen.getByRole("switch", { name: /make template public/i }));

    expect(orpc.templates.setPublic).toHaveBeenCalledWith({ id: "abc", isPublic: false });
  });

  it("shows an error and does not refresh when the request fails", async () => {
    vi.mocked(orpc.templates.setPublic).mockRejectedValue(new Error("nope"));
    const user = userEvent.setup();
    render(<PublishToggle templateId="abc" isPublic={false} />);

    await user.click(screen.getByRole("switch", { name: /make template public/i }));
    await user.click(screen.getByRole("button", { name: /confirm . make public/i }));

    expect(await screen.findByText(/Couldn't update/i)).toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();
  });
});
