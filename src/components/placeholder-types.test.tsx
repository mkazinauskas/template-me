import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { PlaceholderTypes } from "@/components/placeholder-types";

describe("PlaceholderTypes", () => {
  it("renders a row for each supported placeholder type", () => {
    render(<PlaceholderTypes />);
    expect(screen.getByText("String")).toBeInTheDocument();
    expect(screen.getByText("Number")).toBeInTheDocument();
    expect(screen.getByText("Date")).toBeInTheDocument();
    expect(screen.getByText("Boolean")).toBeInTheDocument();
    expect(screen.getByText("Select")).toBeInTheDocument();
  });

  it("renders the syntax example for the date type", () => {
    render(<PlaceholderTypes />);
    expect(screen.getByText('{{key|date("yyyy-mm-dd")}}')).toBeInTheDocument();
  });

  it("is collapsed by default via a <details> element", () => {
    render(<PlaceholderTypes />);
    const details = screen.getByText("Placeholder types & syntax").closest("details");
    expect(details).not.toBeNull();
    expect(details).not.toHaveAttribute("open");
  });
});
