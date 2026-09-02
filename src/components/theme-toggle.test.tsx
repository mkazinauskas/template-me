import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeToggle } from "@/components/theme-toggle";

describe("ThemeToggle", () => {
  beforeEach(() => {
    localStorage.clear();
    delete document.documentElement.dataset.theme;
  });

  afterEach(() => {
    localStorage.clear();
  });

  it("starts on 'system' when nothing is stored", () => {
    render(<ThemeToggle />);
    expect(screen.getByRole("button", { name: /Theme: System/i })).toBeTruthy();
  });

  it("cycles system → light → dark → system, persisting and applying each step", async () => {
    const user = userEvent.setup();
    render(<ThemeToggle />);
    const button = screen.getByRole("button", { name: /Theme:/i });

    await user.click(button);
    expect(localStorage.getItem("theme")).toBe("light");
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(button.getAttribute("aria-label")).toMatch(/Theme: Light/i);

    await user.click(button);
    expect(localStorage.getItem("theme")).toBe("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");

    await user.click(button);
    expect(localStorage.getItem("theme")).toBe("system");
  });

  it("reflects an already-stored preference on mount", () => {
    localStorage.setItem("theme", "dark");
    render(<ThemeToggle />);
    expect(screen.getByRole("button", { name: /Theme: Dark/i })).toBeTruthy();
  });
});
