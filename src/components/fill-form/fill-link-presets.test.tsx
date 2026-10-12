import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { FillLinkPreset, TemplateField } from "@/db/schema";
import { FillRequestsPanel } from "@/components/fill-form/fill-requests-panel";
import { orpc } from "@/lib/orpc";

vi.mock("@/lib/orpc");

const fields: TemplateField[] = [{ key: "full_name", label: "Full name", type: "string", params: [] }];

function preset(overrides: Partial<FillLinkPreset> = {}): FillLinkPreset {
  return {
    id: "p-1",
    userId: "user-1",
    name: "Onboarding",
    title: "Welcome aboard",
    message: "Use your legal name.",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.mocked(orpc.fillRequests.list).mockReset().mockResolvedValue({ fillRequests: [] } as never);
  vi.mocked(orpc.fillRequests.create).mockReset().mockResolvedValue({} as never);
  vi.mocked(orpc.fillLinkPresets.list).mockReset().mockResolvedValue({ presets: [preset()] } as never);
  vi.mocked(orpc.fillLinkPresets.create).mockReset();
  vi.mocked(orpc.fillLinkPresets.update).mockReset();
  vi.mocked(orpc.fillLinkPresets.delete).mockReset().mockResolvedValue({ id: "p-1" } as never);
});

async function openDialog(user: ReturnType<typeof userEvent.setup>) {
  render(<FillRequestsPanel templateId="tpl-1" templateName="Contract" fields={fields} />);
  await user.click(await screen.findByRole("button", { name: /new link/i }));
  await screen.findByRole("option", { name: "Onboarding" });
}

describe("fill link presets", () => {
  it("fills the title and message from a picked preset and sends them", async () => {
    const user = userEvent.setup();
    await openDialog(user);

    await user.selectOptions(screen.getByLabelText(/^preset$/i), "Onboarding");
    expect(screen.getByLabelText(/^title/i)).toHaveValue("Welcome aboard");
    expect(screen.getByLabelText(/^message/i)).toHaveValue("Use your legal name.");

    await user.click(screen.getByRole("button", { name: /create link/i }));
    expect(orpc.fillRequests.create).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Welcome aboard", message: "Use your legal name." })
    );
  });

  it("clears the title and message when switching back to Custom", async () => {
    const user = userEvent.setup();
    await openDialog(user);

    await user.selectOptions(screen.getByLabelText(/^preset$/i), "Onboarding");
    await user.selectOptions(screen.getByLabelText(/^preset$/i), "Custom");
    expect(screen.getByLabelText(/^title/i)).toHaveValue("");
    expect(screen.getByLabelText(/^message/i)).toHaveValue("");
  });

  it("saves the typed title and message as a new preset", async () => {
    vi.mocked(orpc.fillLinkPresets.create).mockResolvedValue({
      preset: preset({ id: "p-2", name: "Contractors", title: "Contract details", message: "Thanks!" }),
    } as never);
    const user = userEvent.setup();
    await openDialog(user);

    expect(screen.getByRole("button", { name: /save as new/i })).toBeDisabled();
    await user.type(screen.getByLabelText(/^title/i), "Contract details");
    await user.type(screen.getByLabelText(/^message/i), "Thanks!");
    await user.click(screen.getByRole("button", { name: /save as new/i }));
    await user.type(screen.getByLabelText(/new preset name/i), "Contractors{Enter}");

    expect(orpc.fillLinkPresets.create).toHaveBeenCalledWith({
      name: "Contractors",
      title: "Contract details",
      message: "Thanks!",
    });
    expect(orpc.fillRequests.create).not.toHaveBeenCalled();
    expect(await screen.findByLabelText(/^preset$/i)).toHaveDisplayValue("Contractors");
  });

  it("updates the picked preset after its text is edited", async () => {
    vi.mocked(orpc.fillLinkPresets.update).mockResolvedValue({
      preset: preset({ title: "Welcome!" }),
    } as never);
    const user = userEvent.setup();
    await openDialog(user);

    await user.selectOptions(screen.getByLabelText(/^preset$/i), "Onboarding");
    await user.clear(screen.getByLabelText(/^title/i));
    await user.type(screen.getByLabelText(/^title/i), "Welcome!");
    await user.click(screen.getByRole("button", { name: /update preset/i }));

    expect(orpc.fillLinkPresets.update).toHaveBeenCalledWith({
      id: "p-1",
      name: "Onboarding",
      title: "Welcome!",
      message: "Use your legal name.",
    });
  });

  it("edits and deletes presets from the manager", async () => {
    vi.mocked(orpc.fillLinkPresets.update).mockResolvedValue({
      preset: preset({ name: "Onboarding v2" }),
    } as never);
    const user = userEvent.setup();
    await openDialog(user);

    await user.click(screen.getByRole("button", { name: /manage presets/i }));
    const dialog = screen.getByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: /^edit$/i }));
    await user.clear(within(dialog).getByLabelText(/preset name/i));
    await user.type(within(dialog).getByLabelText(/preset name/i), "Onboarding v2");
    await user.click(within(dialog).getByRole("button", { name: /save changes/i }));
    expect(orpc.fillLinkPresets.update).toHaveBeenCalledWith(
      expect.objectContaining({ id: "p-1", name: "Onboarding v2" })
    );

    await user.click(await within(dialog).findByRole("button", { name: /^delete$/i }));
    expect(orpc.fillLinkPresets.delete).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole("button", { name: /^confirm$/i }));
    expect(orpc.fillLinkPresets.delete).toHaveBeenCalledWith({ id: "p-1" });
    expect(await within(dialog).findByText(/no presets yet/i)).toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: /back to link/i }));
    expect(screen.getByRole("button", { name: /create link/i })).toBeInTheDocument();
  });
});
