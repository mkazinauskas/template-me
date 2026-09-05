import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FakeSigningView } from "@/components/fake-signing-view";
import type { FakeSigning } from "@/lib/dokobit/fake";
import { orpc } from "@/lib/orpc";

vi.mock("@/lib/orpc");
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const SIGNING: FakeSigning = {
  token: "abc123",
  filename: "Offer_Letter.pdf",
  signingName: "Offer Letter",
  signer: { email: "jonas.petraitis@example.lt", name: "Jonas", surname: "Petraitis" },
  createdAt: "2026-09-06T09:00:00.000Z",
  signedAt: null,
};

const SIGNED_AT = "2026-09-06T10:00:00.000Z";

function renderView(signing: FakeSigning = SIGNING) {
  return render(<FakeSigningView signing={signing} />);
}

/**
 * The badge's timestamp. It's rendered in the viewer's own locale — which is
 * why it carries a stable machine-readable `datetime` for assertions (and why
 * it's hydration-suppressed in the component).
 */
function signedTime() {
  return document.querySelector("time");
}

describe("FakeSigningView", () => {
  beforeEach(() => {
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL: vi.fn(() => "blob:fake-pdf"),
      revokeObjectURL: vi.fn(),
    });
    vi.mocked(orpc.fakeDokobit.download).mockResolvedValue(
      new File(["%PDF-1.7"], "abc123.pdf", { type: "application/pdf" })
    );
    vi.mocked(orpc.fakeDokobit.sign).mockResolvedValue({
      signing: { ...SIGNING, signedAt: SIGNED_AT },
    });
  });

  it("says plainly that this is a local simulation, not a real signature", async () => {
    renderView();
    expect(screen.getByText("Simulated Dokobit signing")).toBeInTheDocument();
    expect(screen.getByText(/not a real signature/)).toBeInTheDocument();
  });

  it("shows the document name and who was invited", () => {
    renderView();
    expect(screen.getByRole("heading", { name: "Offer Letter" })).toBeInTheDocument();
    expect(screen.getByText(/Offer_Letter\.pdf/)).toBeInTheDocument();
    expect(screen.getByText(/jonas\.petraitis@example\.lt/)).toBeInTheDocument();
  });

  it("loads the stored PDF into the preview pane", async () => {
    renderView();
    await waitFor(() =>
      expect(orpc.fakeDokobit.download).toHaveBeenCalledWith({ token: "abc123" })
    );
    await waitFor(() =>
      expect(screen.getByTitle("Document preview")).toHaveAttribute("src", "blob:fake-pdf")
    );
  });

  it("signs on click and swaps the button for a signed badge", async () => {
    const user = userEvent.setup();
    renderView();

    await user.click(screen.getByRole("button", { name: "Sign" }));

    await waitFor(() => expect(screen.getByText("Signed")).toBeInTheDocument());
    expect(orpc.fakeDokobit.sign).toHaveBeenCalledWith({ token: "abc123" });
    expect(screen.queryByRole("button", { name: "Sign" })).not.toBeInTheDocument();
    expect(signedTime()).toHaveAttribute("datetime", SIGNED_AT);
  });

  it("opens already signed when it was signed before", () => {
    renderView({ ...SIGNING, signedAt: SIGNED_AT });
    expect(screen.getByText("Signed")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Sign" })).not.toBeInTheDocument();
    expect(signedTime()).toHaveAttribute("datetime", SIGNED_AT);
  });

  it("surfaces a signing failure and leaves the button usable", async () => {
    vi.mocked(orpc.fakeDokobit.sign).mockRejectedValue(new Error("Signing not found"));
    const user = userEvent.setup();
    renderView();

    await user.click(screen.getByRole("button", { name: "Sign" }));

    expect(await screen.findByText("Signing not found")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign" })).toBeEnabled();
  });

  it("surfaces a document that fails to load", async () => {
    vi.mocked(orpc.fakeDokobit.download).mockRejectedValue(new Error("Signing not found"));
    renderView();
    expect(await screen.findByText("Could not load the document")).toBeInTheDocument();
  });
});
