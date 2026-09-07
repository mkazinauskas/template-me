import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { useResizablePaneWidth, ResizeHandle } from "@/hooks/use-resizable-pane-width";

// jsdom has PointerEvent but no pointer-capture implementation; the hook calls
// setPointerCapture on pointerdown, so stub it to a no-op.
beforeEach(() => {
  Element.prototype.setPointerCapture ??= () => {};
  localStorage.clear();
});

/**
 * Minimal stand-in for the split panes that use the hook: a left column whose
 * width the handle drags. jsdom reports a container `left` of 0, so a
 * pointermove at clientX N lands the pane at exactly N (before clamping).
 */
function Pane({ storageKey = "testPaneWidth" }: { storageKey?: string } = {}) {
  const { width, containerRef, startResizing, resetWidth } = useResizablePaneWidth({
    storageKey,
    min: 100,
    max: 500,
    defaultWidth: 300,
  });
  return (
    <div ref={containerRef}>
      <div data-testid="pane" style={{ width }} />
      <ResizeHandle onPointerDown={startResizing} onReset={resetWidth} />
    </div>
  );
}

function drag(to: number) {
  fireEvent.pointerDown(screen.getByRole("separator", { name: /resize form panel/i }), {
    pointerId: 1,
  });
  fireEvent.pointerMove(window, { clientX: to });
}

describe("useResizablePaneWidth", () => {
  it("drags the pane to follow the pointer", () => {
    render(<Pane />);
    expect(screen.getByTestId("pane")).toHaveStyle({ width: "300px" });

    drag(420);

    expect(screen.getByTestId("pane")).toHaveStyle({ width: "420px" });
  });

  it("ignores pointer moves that aren't part of a drag", () => {
    render(<Pane />);

    fireEvent.pointerMove(window, { clientX: 420 });

    expect(screen.getByTestId("pane")).toHaveStyle({ width: "300px" });
  });

  it("clamps the width to [min, max]", () => {
    render(<Pane />);

    drag(9000);
    expect(screen.getByTestId("pane")).toHaveStyle({ width: "500px" });

    fireEvent.pointerMove(window, { clientX: -50 });
    expect(screen.getByTestId("pane")).toHaveStyle({ width: "100px" });
  });

  it("stops tracking the pointer after release", () => {
    render(<Pane />);

    drag(420);
    fireEvent.pointerUp(window);
    fireEvent.pointerMove(window, { clientX: 180 });

    expect(screen.getByTestId("pane")).toHaveStyle({ width: "420px" });
  });

  it("persists the width on release and restores it on the next mount", () => {
    const { unmount } = render(<Pane />);

    drag(420);
    fireEvent.pointerUp(window);
    expect(localStorage.getItem("testPaneWidth")).toBe("420");

    unmount();
    render(<Pane />);

    expect(screen.getByTestId("pane")).toHaveStyle({ width: "420px" });
  });

  it("ignores a stored width outside [min, max]", () => {
    localStorage.setItem("testPaneWidth", "9000");
    render(<Pane />);

    expect(screen.getByTestId("pane")).toHaveStyle({ width: "300px" });
  });

  it("keeps panes on separate storage keys independent", () => {
    render(<Pane storageKey="paneA" />);
    drag(420);
    fireEvent.pointerUp(window);

    expect(localStorage.getItem("paneA")).toBe("420");
    expect(localStorage.getItem("paneB")).toBeNull();
  });

  it("double-clicking the handle resets to the default width", () => {
    render(<Pane />);
    drag(420);
    fireEvent.pointerUp(window);

    fireEvent.doubleClick(screen.getByRole("separator", { name: /resize form panel/i }));

    expect(screen.getByTestId("pane")).toHaveStyle({ width: "300px" });
    expect(localStorage.getItem("testPaneWidth")).toBe("300");
  });

  it("restores the body cursor and text selection after a drag", () => {
    render(<Pane />);

    drag(420);
    expect(document.body.style.cursor).toBe("col-resize");
    expect(document.body.style.userSelect).toBe("none");

    fireEvent.pointerUp(window);
    expect(document.body.style.cursor).toBe("");
    expect(document.body.style.userSelect).toBe("");
  });
});

describe("ResizeHandle", () => {
  it("exposes itself as a vertical separator", () => {
    render(<ResizeHandle onPointerDown={vi.fn()} onReset={vi.fn()} />);

    const handle = screen.getByRole("separator", { name: /resize form panel/i });
    expect(handle).toHaveAttribute("aria-orientation", "vertical");
  });
});
