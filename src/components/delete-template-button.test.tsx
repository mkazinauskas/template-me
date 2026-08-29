import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DeleteTemplateButton } from "@/components/delete-template-button";

const push = vi.fn();
const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh }),
}));

describe("DeleteTemplateButton", () => {
  beforeEach(() => {
    push.mockReset();
    refresh.mockReset();
    vi.stubGlobal("confirm", vi.fn());
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("does nothing when the confirm dialog is dismissed", async () => {
    (globalThis.confirm as ReturnType<typeof vi.fn>).mockReturnValue(false);
    const user = userEvent.setup();
    render(<DeleteTemplateButton templateId="abc" />);

    await user.click(screen.getByRole("button", { name: "Delete" }));

    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });

  it("deletes the template and navigates to the dashboard on success", async () => {
    (globalThis.confirm as ReturnType<typeof vi.fn>).mockReturnValue(true);
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true });
    const user = userEvent.setup();
    render(<DeleteTemplateButton templateId="abc" />);

    await user.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/dashboard"));
    expect(globalThis.fetch).toHaveBeenCalledWith("/api/templates/abc", { method: "DELETE" });
    expect(refresh).toHaveBeenCalled();
  });

  it("shows 'Deleting…' while the request is in flight and re-enables on failure", async () => {
    (globalThis.confirm as ReturnType<typeof vi.fn>).mockReturnValue(true);
    let resolveFetch!: (value: { ok: boolean }) => void;
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockReturnValue(
      new Promise((resolve) => {
        resolveFetch = resolve;
      })
    );
    const user = userEvent.setup();
    render(<DeleteTemplateButton templateId="abc" />);

    await user.click(screen.getByRole("button", { name: "Delete" }));
    expect(await screen.findByRole("button", { name: "Deleting…" })).toBeDisabled();

    resolveFetch({ ok: false });

    const button = await screen.findByRole("button", { name: "Delete" });
    expect(button).not.toBeDisabled();
    expect(push).not.toHaveBeenCalled();
  });
});
