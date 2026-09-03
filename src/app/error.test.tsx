import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ErrorPage from "@/app/error";

describe("ErrorPage", () => {
  it("shows a friendly message and a way back to the dashboard", () => {
    render(<ErrorPage error={new Error("boom")} retry={vi.fn()} />);

    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(/unexpected error occurred/i);
    expect(screen.getByRole("link", { name: "Go to dashboard" })).toHaveAttribute(
      "href",
      "/client/dashboard"
    );
  });

  it("calls retry when 'Try again' is clicked", async () => {
    const retry = vi.fn();
    const user = userEvent.setup();
    render(<ErrorPage error={new Error("boom")} retry={retry} />);

    await user.click(screen.getByRole("button", { name: "Try again" }));

    expect(retry).toHaveBeenCalled();
  });

  it("logs the error to the console for debugging", () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const error = new Error("boom");
    render(<ErrorPage error={error} retry={vi.fn()} />);

    expect(consoleSpy).toHaveBeenCalledWith(error);
    consoleSpy.mockRestore();
  });
});
