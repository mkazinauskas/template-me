import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { DocumentPreviewPane } from "@/components/document-preview-pane";

describe("DocumentPreviewPane", () => {
  it("renders the empty state when there is no preview URL", () => {
    render(
      <DocumentPreviewPane
        url={null}
        loading={false}
        error={null}
        emptyState={<p>Nothing to preview yet</p>}
      />
    );

    expect(screen.getByText("Nothing to preview yet")).toBeInTheDocument();
    expect(screen.queryByTitle("Document preview")).not.toBeInTheDocument();
  });

  it("renders the iframe (and hides the empty state) once a URL is set", () => {
    render(
      <DocumentPreviewPane
        url="blob:mock-url"
        loading={false}
        error={null}
        emptyState={<p>Nothing to preview yet</p>}
      />
    );

    expect(screen.getByTitle("Document preview")).toHaveAttribute("src", "blob:mock-url");
    expect(screen.queryByText("Nothing to preview yet")).not.toBeInTheDocument();
  });

  it("shows the loading label as an alert while loading", () => {
    render(
      <DocumentPreviewPane
        url={null}
        loading={true}
        error={null}
        loadingLabel="Rendering preview…"
        emptyState={<p>Nothing to preview yet</p>}
      />
    );

    expect(screen.getByRole("alert")).toHaveTextContent("Rendering preview…");
  });

  it("shows the error message as an alert instead of the loading label", () => {
    render(
      <DocumentPreviewPane
        url={null}
        loading={true}
        error="Failed to render preview"
        loadingLabel="Rendering preview…"
        emptyState={<p>Nothing to preview yet</p>}
      />
    );

    expect(screen.getByRole("alert")).toHaveTextContent("Failed to render preview");
  });

  it("renders extra preview actions alongside the iframe", () => {
    render(
      <DocumentPreviewPane
        url="blob:mock-url"
        loading={false}
        error={null}
        emptyState={<p>Nothing to preview yet</p>}
        previewActions={<button type="button">Back to editing</button>}
      />
    );

    expect(screen.getByRole("button", { name: "Back to editing" })).toBeInTheDocument();
  });
});
