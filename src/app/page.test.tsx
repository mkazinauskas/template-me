import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("next/headers", () => ({
  headers: () => Promise.resolve(new Headers()),
}));

const { getSession } = vi.hoisted(() => ({ getSession: vi.fn() }));

vi.mock("@/lib/auth", () => ({
  auth: { api: { getSession } },
}));

// LandingPage is an async Server Component (it awaits the session), so we
// await it directly to get the resolved element before rendering it.
async function renderLandingPage() {
  const { default: LandingPage } = await import("@/app/page");
  const element = await LandingPage();
  return render(element);
}

describe("LandingPage", () => {
  it("renders the headline", async () => {
    getSession.mockResolvedValue(null);
    await renderLandingPage();

    expect(
      screen.getByRole("heading", { level: 1, name: "Turn Word docs into fillable PDF templates" })
    ).toBeInTheDocument();
  });

  it("points the header login and hero call-to-action at /sign-in when logged out", async () => {
    getSession.mockResolvedValue(null);
    await renderLandingPage();

    expect(screen.getByRole("link", { name: "Login" })).toHaveAttribute("href", "/sign-in");
    const ctas = screen.getAllByRole("link", { name: "Get started free" });
    expect(ctas.length).toBeGreaterThan(0);
    for (const link of ctas) {
      expect(link).toHaveAttribute("href", "/sign-in");
    }
    expect(screen.queryByRole("link", { name: "Dashboard" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Go to Dashboard" })).not.toBeInTheDocument();
  });

  it("shows dashboard links to /client/dashboard when logged in", async () => {
    getSession.mockResolvedValue({ user: { id: "user-1", email: "owner@example.com" } });
    await renderLandingPage();

    expect(screen.getByRole("link", { name: "Dashboard" })).toHaveAttribute(
      "href",
      "/client/dashboard"
    );
    expect(screen.getAllByRole("link", { name: "Go to Dashboard" }).length).toBeGreaterThan(0);
    expect(screen.queryByRole("link", { name: "Login" })).not.toBeInTheDocument();
    for (const link of screen.getAllByRole("link", { name: "Go to Dashboard" })) {
      expect(link).toHaveAttribute("href", "/client/dashboard");
    }
  });

  it("links the download-example anchor to the static example file", async () => {
    getSession.mockResolvedValue(null);
    await renderLandingPage();
    expect(screen.getByRole("link", { name: "Download example template" })).toHaveAttribute(
      "href",
      "/example-template.docx"
    );
  });

  it("lists all three onboarding steps", async () => {
    getSession.mockResolvedValue(null);
    await renderLandingPage();
    expect(screen.getByText("Upload a template")).toBeInTheDocument();
    expect(screen.getByText("Fill in the fields")).toBeInTheDocument();
    expect(screen.getByText("Download a PDF")).toBeInTheDocument();
  });

  it("lists all four feature callouts", async () => {
    getSession.mockResolvedValue(null);
    await renderLandingPage();
    expect(screen.getByText("Automatic field detection")).toBeInTheDocument();
    expect(screen.getByText("Bulk generation")).toBeInTheDocument();
    expect(screen.getByText("Typed fields")).toBeInTheDocument();
    expect(screen.getByText("No installs")).toBeInTheDocument();
  });

  it("renders an FAQ section", async () => {
    getSession.mockResolvedValue(null);
    await renderLandingPage();
    expect(
      screen.getByRole("heading", { level: 2, name: "Frequently asked questions" })
    ).toBeInTheDocument();
    expect(screen.getByText("What files does Template Me work with?")).toBeInTheDocument();
  });

  it("embeds SoftwareApplication and FAQPage JSON-LD", async () => {
    getSession.mockResolvedValue(null);
    const { container } = await renderLandingPage();
    const script = container.querySelector('script[type="application/ld+json"]');
    expect(script).not.toBeNull();
    const data = JSON.parse(script!.textContent!);
    const types = data["@graph"].map((node: { "@type": string }) => node["@type"]);
    expect(types).toContain("SoftwareApplication");
    expect(types).toContain("FAQPage");
  });
});
