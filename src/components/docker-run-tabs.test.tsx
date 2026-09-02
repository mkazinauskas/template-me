import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DockerRunTabs } from "@/components/docker-run-tabs";

describe("DockerRunTabs", () => {
  it("shows Linux selected by default with its wget command", () => {
    render(<DockerRunTabs />);
    expect(screen.getByRole("tab", { name: "Linux" })).toHaveAttribute(
      "aria-selected",
      "true"
    );
    const panel = screen.getByRole("tabpanel");
    expect(
      within(panel).getByText(/^wget https:\/\/raw\.githubusercontent\.com/)
    ).toBeInTheDocument();
  });

  it("switches to Windows on click and shows the PowerShell command", async () => {
    const user = userEvent.setup();
    render(<DockerRunTabs />);

    await user.click(screen.getByRole("tab", { name: "Windows" }));

    expect(screen.getByRole("tab", { name: "Windows" })).toHaveAttribute(
      "aria-selected",
      "true"
    );
    const panel = screen.getByRole("tabpanel");
    expect(within(panel).getByText(/^curl\.exe -O /)).toBeInTheDocument();
    expect(
      within(panel).getByText("winget install suse.RancherDesktop")
    ).toBeInTheDocument();
  });

  it("shows the macOS Rancher Desktop / Homebrew setup step", async () => {
    const user = userEvent.setup();
    render(<DockerRunTabs />);

    await user.click(screen.getByRole("tab", { name: "macOS" }));

    const panel = screen.getByRole("tabpanel");
    expect(
      within(panel).getByText(/brew install --cask rancher/)
    ).toBeInTheDocument();
    expect(within(panel).getByText(/^curl -O /)).toBeInTheDocument();
  });

  it("moves between tabs with arrow keys", async () => {
    const user = userEvent.setup();
    render(<DockerRunTabs />);

    await user.click(screen.getByRole("tab", { name: "Linux" }));
    await user.keyboard("{ArrowRight}");

    expect(screen.getByRole("tab", { name: "macOS" })).toHaveAttribute(
      "aria-selected",
      "true"
    );
  });

  it("always ends with the docker compose up command", () => {
    render(<DockerRunTabs />);
    expect(
      screen.getByText("docker compose -f docker-compose.prebuilt.yml up")
    ).toBeInTheDocument();
  });
});
