import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { WidthToggle } from "@/components/width-toggle";

describe("WidthToggle", () => {
  beforeEach(() => {
    localStorage.clear();
    delete document.documentElement.dataset.width;
  });

  afterEach(() => {
    localStorage.clear();
  });

  it("defaults to the centred layout when nothing is stored", () => {
    render(<WidthToggle />);
    expect(screen.getByRole("button", { name: /Layout: Centred/i })).toBeTruthy();
  });

  it("toggles centred → full → centred, persisting and applying each step", async () => {
    const user = userEvent.setup();
    render(<WidthToggle />);
    const button = screen.getByRole("button", { name: /Layout:/i });

    await user.click(button);
    expect(localStorage.getItem("width")).toBe("full");
    expect(document.documentElement.dataset.width).toBe("full");
    expect(button.getAttribute("aria-label")).toMatch(/Layout: Full width/i);
    expect(button.getAttribute("aria-pressed")).toBe("true");

    await user.click(button);
    expect(localStorage.getItem("width")).toBe("page");
    expect(document.documentElement.dataset.width).toBe("page");
    expect(button.getAttribute("aria-pressed")).toBe("false");
  });

  it("reflects an already-stored preference on mount", () => {
    localStorage.setItem("width", "full");
    render(<WidthToggle />);
    expect(screen.getByRole("button", { name: /Layout: Full width/i })).toBeTruthy();
  });
});
