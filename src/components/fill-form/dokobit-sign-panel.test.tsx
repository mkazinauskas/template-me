import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DokobitSignPanel } from "./dokobit-sign-panel";
import { ORPCError, orpc } from "@/lib/orpc";

vi.mock("@/lib/orpc");

const VALUES = { full_name: "Jane Doe", salary: "1000" };

const SIGNING_RESULT = {
  signingToken: "signing-token",
  signingUrl: "https://gateway.dokobit.test/signing/signing-token?access_token=signer-token",
  email: "jonas.petraitis@example.lt",
};

function renderPanel() {
  return render(<DokobitSignPanel templateId="t1" values={VALUES} />);
}

/** Clicks the entry-point button and returns a `user` for the revealed panel. */
async function openPanel() {
  const user = userEvent.setup();
  renderPanel();
  await user.click(screen.getByRole("button", { name: "Sign with Dokobit" }));
  return user;
}

describe("DokobitSignPanel", () => {
  beforeEach(() => {
    vi.mocked(orpc.templates.sendForSigning).mockReset();
    vi.mocked(orpc.templates.sendForSigning).mockResolvedValue(SIGNING_RESULT);
  });

  it("asks for nothing until the button is clicked", () => {
    renderPanel();
    expect(screen.getByRole("button", { name: "Sign with Dokobit" })).toBeInTheDocument();
    expect(screen.queryByLabelText(/Signer email/)).not.toBeInTheDocument();
  });

  it("reveals the signer email field when the button is clicked", async () => {
    await openPanel();
    expect(screen.getByLabelText(/Signer email/)).toHaveFocus();
  });

  it("sends the filled values and the signer to the server", async () => {
    const user = await openPanel();

    await user.type(screen.getByLabelText(/Signer email/), "jonas.petraitis@example.lt");
    await user.click(screen.getByRole("button", { name: "Send for signing" }));

    await waitFor(() =>
      expect(orpc.templates.sendForSigning).toHaveBeenCalledWith({
        id: "t1",
        data: VALUES,
        signer: {
          email: "jonas.petraitis@example.lt",
          name: "Jonas",
          surname: "Petraitis",
        },
      })
    );
  });

  it("prefills the signer's name from the email, and lets it be overridden", async () => {
    const user = await openPanel();

    await user.type(screen.getByLabelText(/Signer email/), "jonas.petraitis@example.lt");
    expect(screen.getByLabelText(/Signer first name/)).toHaveValue("Jonas");

    await user.clear(screen.getByLabelText(/Signer last name/));
    await user.type(screen.getByLabelText(/Signer last name/), "Petraitienė");
    // Editing a name pins it: further typing in the email must not overwrite it.
    await user.type(screen.getByLabelText(/Signer email/), "x");

    expect(screen.getByLabelText(/Signer last name/)).toHaveValue("Petraitienė");
  });

  it("cannot be sent until the email and both names are filled in", async () => {
    const user = await openPanel();
    const send = screen.getByRole("button", { name: "Send for signing" });

    expect(send).toBeDisabled();
    // A single-token address can't be split, so the names must be typed.
    await user.type(screen.getByLabelText(/Signer email/), "jonas@example.lt");
    expect(send).toBeDisabled();

    await user.type(screen.getByLabelText(/Signer first name/), "Jonas");
    expect(send).toBeDisabled();

    await user.type(screen.getByLabelText(/Signer last name/), "Petraitis");
    expect(send).toBeEnabled();
  });

  it("confirms who it was sent to and links to the signing page", async () => {
    const user = await openPanel();

    await user.type(screen.getByLabelText(/Signer email/), "jonas.petraitis@example.lt");
    await user.click(screen.getByRole("button", { name: "Send for signing" }));

    const status = await screen.findByRole("status");
    expect(status).toHaveTextContent("jonas.petraitis@example.lt");
    expect(screen.getByRole("link", { name: /Open the signing page/ })).toHaveAttribute(
      "href",
      SIGNING_RESULT.signingUrl
    );
    // The panel collapses once the invitation is out.
    expect(screen.queryByLabelText(/Signer email/)).not.toBeInTheDocument();
  });

  it("shows the server's error and keeps the panel open so it can be retried", async () => {
    vi.mocked(orpc.templates.sendForSigning).mockRejectedValue(
      new ORPCError("BAD_GATEWAY", { message: "Dokobit rejected the request" })
    );
    const user = await openPanel();

    await user.type(screen.getByLabelText(/Signer email/), "jonas.petraitis@example.lt");
    await user.click(screen.getByRole("button", { name: "Send for signing" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Dokobit rejected the request");
    expect(screen.getByLabelText(/Signer email/)).toHaveValue("jonas.petraitis@example.lt");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("submits on Enter instead of letting the surrounding fill form download", async () => {
    const onSubmit = vi.fn((e: React.FormEvent) => e.preventDefault());
    const user = userEvent.setup();
    render(
      <form onSubmit={onSubmit}>
        <DokobitSignPanel templateId="t1" values={VALUES} />
      </form>
    );

    await user.click(screen.getByRole("button", { name: "Sign with Dokobit" }));
    await user.type(screen.getByLabelText(/Signer email/), "jonas.petraitis@example.lt{Enter}");

    await waitFor(() => expect(orpc.templates.sendForSigning).toHaveBeenCalled());
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("closes without sending when cancelled", async () => {
    const user = await openPanel();

    await user.type(screen.getByLabelText(/Signer email/), "jonas.petraitis@example.lt");
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByLabelText(/Signer email/)).not.toBeInTheDocument();
    expect(orpc.templates.sendForSigning).not.toHaveBeenCalled();
  });
});
