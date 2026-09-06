import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { FillRequest, TemplateField } from "@/db/schema";
import { FillRequestsPanel } from "@/components/fill-form/fill-requests-panel";
import { orpc } from "@/lib/orpc";

vi.mock("@/lib/orpc");

const fields: TemplateField[] = [
  { key: "name", label: "Name", type: "string", params: [] },
  { key: "city", label: "City", type: "string", params: [] },
];

const filledRequest = {
  id: "req-1",
  templateId: "tpl-1",
  code: "abc123",
  data: { name: "Ada", city: "London" },
  createdAt: new Date("2026-01-01T10:00:00Z"),
  filledAt: new Date("2026-01-02T10:00:00Z"),
  revokedAt: null,
} as unknown as FillRequest;

const handleName = { name: /resize form panel/i };

beforeEach(() => {
  // jsdom has PointerEvent but no pointer-capture implementation; the resize
  // handle calls setPointerCapture on pointerdown, so stub it to a no-op.
  Element.prototype.setPointerCapture ??= () => {};
  localStorage.clear();
  vi.mocked(orpc.fillRequests.list).mockReset().mockResolvedValue({
    fillRequests: [filledRequest],
  } as never);
  vi.mocked(orpc.templates.generate).mockReset().mockResolvedValue(new Blob(["x"]) as never);
  URL.createObjectURL ??= () => "blob:preview";
  URL.revokeObjectURL ??= () => {};
});

function renderPanel() {
  return render(
    <FillRequestsPanel templateId="tpl-1" templateName="Contract" fields={fields} />
  );
}

/** Opens a submitted link's edit view, where the fields/preview split pane lives. */
async function openEditPane(user: ReturnType<typeof userEvent.setup>) {
  await screen.findByRole("button", { name: /view data/i });
  await user.click(screen.getByRole("button", { name: /view data/i }));
  await user.click(screen.getByRole("button", { name: /^edit$/i }));
  return await screen.findByRole("separator", handleName);
}

describe("FillRequestsPanel edit pane", () => {
  it("has no resize handle until a submitted link is being edited", async () => {
    const user = userEvent.setup();
    renderPanel();

    await screen.findByRole("button", { name: /view data/i });
    expect(screen.queryByRole("separator", handleName)).not.toBeInTheDocument();

    await openEditPane(user);
    expect(screen.getByRole("separator", handleName)).toBeInTheDocument();
  });

  it("drags the fields column to follow the pointer", async () => {
    const user = userEvent.setup();
    renderPanel();
    const handle = await openEditPane(user);

    // The fields column is the sibling immediately before the handle.
    const column = handle.previousElementSibling;
    expect(column).toHaveStyle({ "--fields-width": "288px" });

    fireEvent.pointerDown(handle, { pointerId: 1 });
    fireEvent.pointerMove(window, { clientX: 460 });

    expect(column).toHaveStyle({ "--fields-width": "460px" });
  });

  it("persists the dragged width under its own storage key", async () => {
    const user = userEvent.setup();
    renderPanel();
    const handle = await openEditPane(user);

    fireEvent.pointerDown(handle, { pointerId: 1 });
    fireEvent.pointerMove(window, { clientX: 460 });
    fireEvent.pointerUp(window);

    await waitFor(() =>
      expect(localStorage.getItem("fillRequestEditPaneWidth")).toBe("460")
    );
    // The single-fill form's own width is untouched.
    expect(localStorage.getItem("fillFormPaneWidth")).toBeNull();
  });
});
