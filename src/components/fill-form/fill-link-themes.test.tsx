import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { FillLinkTheme, TemplateField } from "@/db/schema";
import { FillRequestsPanel } from "@/components/fill-form/fill-requests-panel";
import { FillRequestForm } from "@/components/fill-request-form";
import { DEFAULT_THEME_COLORS } from "@/lib/fill-link-theme";
import { orpc } from "@/lib/orpc";

vi.mock("@/lib/orpc");

const fields: TemplateField[] = [{ key: "full_name", label: "Full name", type: "string", params: [] }];

const brand = { ...DEFAULT_THEME_COLORS, button: "#0055ff" };

function theme(overrides: Partial<FillLinkTheme> = {}): FillLinkTheme {
  return {
    id: "th-1",
    userId: "user-1",
    name: "Brand",
    colors: brand,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.mocked(orpc.fillRequests.list).mockReset().mockResolvedValue({ fillRequests: [] } as never);
  vi.mocked(orpc.fillRequests.create).mockReset().mockResolvedValue({} as never);
  vi.mocked(orpc.fillLinkPresets.list).mockReset().mockResolvedValue({ presets: [] } as never);
  vi.mocked(orpc.fillLinkThemes.list).mockReset().mockResolvedValue({ themes: [theme()] } as never);
  vi.mocked(orpc.fillLinkThemes.create).mockReset();
  vi.mocked(orpc.fillLinkThemes.update).mockReset();
  vi.mocked(orpc.fillLinkThemes.delete).mockReset().mockResolvedValue({ id: "th-1" } as never);
});

async function openDialog(user: ReturnType<typeof userEvent.setup>) {
  render(<FillRequestsPanel templateId="tpl-1" templateName="Contract" fields={fields} />);
  await user.click(await screen.findByRole("button", { name: /new link/i }));
  await screen.findByRole("option", { name: "Brand" });
  await user.type(screen.getByLabelText(/^title$/i), "Details");
  await user.type(screen.getByLabelText(/^message$/i), "Thanks.");
}

const themeSelect = () => screen.getByLabelText(/page theme/i);
const createLink = (user: ReturnType<typeof userEvent.setup>) =>
  user.click(screen.getByRole("button", { name: /create link/i }));

describe("fill link page themes", () => {
  it("creates a link with the app's own look by default", async () => {
    const user = userEvent.setup();
    await openDialog(user);
    await createLink(user);
    expect(vi.mocked(orpc.fillRequests.create).mock.calls[0][0]).not.toHaveProperty("theme");
  });

  it("sends a saved theme's colors with the link", async () => {
    const user = userEvent.setup();
    await openDialog(user);
    await user.selectOptions(themeSelect(), "Brand");
    await createLink(user);
    expect(orpc.fillRequests.create).toHaveBeenCalledWith(
      expect.objectContaining({ theme: brand }),
    );
  });

  it("lets each part's color be changed and saved as a new theme", async () => {
    const user = userEvent.setup();
    vi.mocked(orpc.fillLinkThemes.create).mockImplementation(
      async ({ name, colors }) => ({ theme: theme({ id: "th-2", name, colors }) }) as never,
    );
    await openDialog(user);
    await user.selectOptions(themeSelect(), "Custom colors");
    fireEvent.input(screen.getByLabelText(/page background/i), { target: { value: "#123456" } });

    await user.click(screen.getByRole("button", { name: /save as theme/i }));
    await user.type(screen.getByLabelText(/new theme name/i), "Dark");
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    const colors = { ...DEFAULT_THEME_COLORS, background: "#123456" };
    expect(orpc.fillLinkThemes.create).toHaveBeenCalledWith({ name: "Dark", colors });
    expect(await screen.findByRole("option", { name: "Dark" })).toBeInTheDocument();
    expect(themeSelect()).toHaveValue("th-2");

    await createLink(user);
    expect(orpc.fillRequests.create).toHaveBeenCalledWith(expect.objectContaining({ theme: colors }));
  });

  it("offers to update a saved theme once its colors are changed", async () => {
    const user = userEvent.setup();
    vi.mocked(orpc.fillLinkThemes.update).mockImplementation(
      async ({ id, name, colors }) => ({ theme: theme({ id, name, colors }) }) as never,
    );
    await openDialog(user);
    await user.selectOptions(themeSelect(), "Brand");
    expect(screen.queryByRole("button", { name: /update theme/i })).not.toBeInTheDocument();

    fireEvent.input(screen.getByLabelText(/^heading$/i), { target: { value: "#abcdef" } });
    await user.click(screen.getByRole("button", { name: /update theme/i }));

    expect(orpc.fillLinkThemes.update).toHaveBeenCalledWith({
      id: "th-1",
      name: "Brand",
      colors: { ...brand, heading: "#abcdef" },
    });
  });

  it("resets the colors to the defaults", async () => {
    const user = userEvent.setup();
    await openDialog(user);
    await user.selectOptions(themeSelect(), "Brand");
    await user.click(screen.getByRole("button", { name: /reset to default/i }));
    expect(screen.getByRole("button", { name: /reset to default/i })).toBeDisabled();

    await createLink(user);
    expect(orpc.fillRequests.create).toHaveBeenCalledWith(
      expect.objectContaining({ theme: DEFAULT_THEME_COLORS }),
    );
  });

  it("deletes a saved theme after confirming", async () => {
    const user = userEvent.setup();
    await openDialog(user);
    await user.selectOptions(themeSelect(), "Brand");
    await user.click(screen.getByRole("button", { name: /delete theme/i }));
    await user.click(screen.getByRole("button", { name: /confirm/i }));

    expect(orpc.fillLinkThemes.delete).toHaveBeenCalledWith({ id: "th-1" });
    expect(screen.queryByRole("option", { name: "Brand" })).not.toBeInTheDocument();
  });
});

describe("FillRequestForm themed", () => {
  it("sits on a themed card with the theme's heading and button colors", () => {
    render(<FillRequestForm code="c" templateName="Contract" fields={fields} title="Hi" themed />);
    expect(screen.getByRole("heading", { name: "Hi" }).className).toContain("--fill-heading");
    expect(screen.getByRole("button", { name: /submit/i }).className).toContain("--fill-button");
  });
});

describe("editing a link's page theme", () => {
  it("opens on the link's own colors as custom colors", async () => {
    vi.mocked(orpc.fillRequests.list).mockResolvedValue({
      fillRequests: [
        {
          id: "req-1",
          templateId: "tpl-1",
          code: "abc123",
          fieldKeys: null,
          title: "Details",
          message: "Thanks.",
          theme: brand,
          data: null,
          createdAt: new Date("2026-01-01T10:00:00Z"),
          filledAt: null,
          revokedAt: null,
        },
      ],
    } as never);
    vi.mocked(orpc.fillRequests.update)
      .mockReset()
      .mockResolvedValue({ fillRequest: {} } as never);
    const user = userEvent.setup();
    render(<FillRequestsPanel templateId="tpl-1" templateName="Contract" fields={fields} />);

    await user.click(await screen.findByRole("button", { name: /^edit$/i }));
    await screen.findByRole("option", { name: "Brand" });
    expect(themeSelect()).toHaveValue("custom");

    await user.selectOptions(themeSelect(), "");
    await user.click(screen.getByRole("button", { name: /save changes/i }));
    expect(orpc.fillRequests.update).toHaveBeenCalledWith(
      expect.objectContaining({ id: "req-1", theme: null })
    );
  });
});
