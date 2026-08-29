import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import LandingPage from "@/app/page";

describe("LandingPage", () => {
  it("renders the headline and primary calls to action", () => {
    render(<LandingPage />);

    expect(
      screen.getByRole("heading", { level: 1, name: "Turn Word docs into fillable PDF templates" })
    ).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "Go to Dashboard" }).length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: "Dashboard" })).toHaveAttribute("href", "/dashboard");
  });

  it("links the download-example anchor to the static example file", () => {
    render(<LandingPage />);
    expect(screen.getByRole("link", { name: "Download example template" })).toHaveAttribute(
      "href",
      "/example-template.docx"
    );
  });

  it("lists all three onboarding steps", () => {
    render(<LandingPage />);
    expect(screen.getByText("Upload a template")).toBeInTheDocument();
    expect(screen.getByText("Fill in the fields")).toBeInTheDocument();
    expect(screen.getByText("Download a PDF")).toBeInTheDocument();
  });

  it("lists all four feature callouts", () => {
    render(<LandingPage />);
    expect(screen.getByText("Automatic field detection")).toBeInTheDocument();
    expect(screen.getByText("Bulk generation")).toBeInTheDocument();
    expect(screen.getByText("Typed fields")).toBeInTheDocument();
    expect(screen.getByText("No installs")).toBeInTheDocument();
  });
});
