import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import RootLayout, { metadata } from "@/app/layout";

vi.mock("next/font/google", () => ({
  Geist: () => ({ variable: "--font-geist-sans" }),
  Geist_Mono: () => ({ variable: "--font-geist-mono" }),
}));

describe("RootLayout", () => {
  const params = Promise.resolve({});

  it("renders children inside the body", () => {
    render(
      <RootLayout params={params}>
        <p>page content</p>
      </RootLayout>
    );
    expect(screen.getByText("page content")).toBeInTheDocument();
  });

  it("renders the footer credit link", () => {
    render(
      <RootLayout params={params}>
        <p>page content</p>
      </RootLayout>
    );
    expect(screen.getByRole("link", { name: "modakoda.com" })).toHaveAttribute(
      "href",
      "https://modakoda.com"
    );
  });
});

describe("metadata", () => {
  it("sets a default title and template", () => {
    expect(metadata.title).toEqual({
      default: "Template Me — Turn Word Docs into Fillable PDF Templates",
      template: "%s · Template Me",
    });
  });

  it("disallows nothing at the root (index: true)", () => {
    expect(metadata.robots).toEqual({ index: true, follow: true });
  });
});
