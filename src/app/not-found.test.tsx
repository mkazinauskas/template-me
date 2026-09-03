import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import NotFound from "@/app/not-found";

describe("NotFound", () => {
  it("shows a friendly message and links back to the dashboard", () => {
    render(<NotFound />);

    expect(screen.getByText("Page not found")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go to dashboard" })).toHaveAttribute(
      "href",
      "/client/dashboard"
    );
  });
});
