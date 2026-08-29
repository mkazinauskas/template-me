import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Logo } from "@/components/logo";

describe("Logo", () => {
  it("renders the wordmark", () => {
    render(<Logo />);
    expect(screen.getByText("Template Me")).toBeInTheDocument();
  });

  it("applies the animate-in class by default", () => {
    const { container } = render(<Logo />);
    expect(container.querySelector("svg")).toHaveClass("animate-logo-in");
  });

  it("omits the animate-in class when animated is false", () => {
    const { container } = render(<Logo animated={false} />);
    expect(container.querySelector("svg")).not.toHaveClass("animate-logo-in");
  });

  it("uses the small size classes when size='sm'", () => {
    const { container } = render(<Logo size="sm" />);
    expect(container.querySelector("svg")).toHaveClass("h-6", "w-6");
  });

  it("uses the medium size classes by default", () => {
    const { container } = render(<Logo />);
    expect(container.querySelector("svg")).toHaveClass("h-8", "w-8");
  });

  it("merges a custom className onto the wrapper", () => {
    const { container } = render(<Logo className="custom-class" />);
    expect(container.firstElementChild).toHaveClass("custom-class");
  });
});
