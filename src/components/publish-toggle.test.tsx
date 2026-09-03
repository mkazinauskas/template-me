import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PublishToggle } from "@/components/publish-toggle";

const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh }),
}));

describe("PublishToggle", () => {
  beforeEach(() => {
    refresh.mockReset();
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("confirms before PATCHing isPublic:true from a private template", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true });
    const user = userEvent.setup();
    render(<PublishToggle templateId="abc" isPublic={false} />);

    // Flipping the switch only opens the inline confirm — no request yet.
    await user.click(screen.getByRole("switch", { name: /make template public/i }));
    expect(globalThis.fetch).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: /^make public$/i }));

    expect(globalThis.fetch).toHaveBeenCalledWith("/api/templates/abc", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isPublic: true }),
    });
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it("cancelling the confirm makes no request", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true });
    const user = userEvent.setup();
    render(<PublishToggle templateId="abc" isPublic={false} />);

    await user.click(screen.getByRole("switch", { name: /make template public/i }));
    await user.click(screen.getByRole("button", { name: /cancel/i }));

    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(screen.getByRole("switch", { name: /make template public/i })).toBeInTheDocument();
  });

  it("PATCHes isPublic:false immediately from a public template (no confirm)", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true });
    const user = userEvent.setup();
    render(<PublishToggle templateId="abc" isPublic={true} />);

    await user.click(screen.getByRole("switch", { name: /make template public/i }));

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/api/templates/abc",
      expect.objectContaining({ body: JSON.stringify({ isPublic: false }) })
    );
  });

  it("shows an error and does not refresh when the request fails", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false });
    const user = userEvent.setup();
    render(<PublishToggle templateId="abc" isPublic={false} />);

    await user.click(screen.getByRole("switch", { name: /make template public/i }));
    await user.click(screen.getByRole("button", { name: /^make public$/i }));

    expect(await screen.findByText(/Couldn't update/i)).toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();
  });
});
