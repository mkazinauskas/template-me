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

  it("PATCHes isPublic:true from a private template and refreshes", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true });
    const user = userEvent.setup();
    render(<PublishToggle templateId="abc" isPublic={false} />);

    await user.click(screen.getByRole("button", { name: /make public/i }));

    expect(globalThis.fetch).toHaveBeenCalledWith("/api/templates/abc", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isPublic: true }),
    });
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it("PATCHes isPublic:false from a public template", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true });
    const user = userEvent.setup();
    render(<PublishToggle templateId="abc" isPublic={true} />);

    await user.click(screen.getByRole("button", { name: /anyone with the link/i }));

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/api/templates/abc",
      expect.objectContaining({ body: JSON.stringify({ isPublic: false }) })
    );
  });

  it("shows an error and does not refresh when the request fails", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false });
    const user = userEvent.setup();
    render(<PublishToggle templateId="abc" isPublic={false} />);

    await user.click(screen.getByRole("button", { name: /make public/i }));

    expect(await screen.findByText(/Couldn't update/i)).toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();
  });
});
