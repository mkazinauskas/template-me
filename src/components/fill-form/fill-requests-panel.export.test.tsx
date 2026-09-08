import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
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

beforeEach(() => {
  vi.mocked(orpc.fillRequests.list).mockReset().mockResolvedValue({
    fillRequests: [filledRequest],
  } as never);
  vi.stubGlobal(
    "URL",
    Object.assign(URL, {
      createObjectURL: vi.fn(() => "blob:mock-url"),
      revokeObjectURL: vi.fn(),
    })
  );
});

describe("FillRequestsPanel — exporting submitted data", () => {
  it("downloads a submission as a values file the fill-one form can import", async () => {
    const user = userEvent.setup();
    const anchors: HTMLAnchorElement[] = [];
    const originalCreateElement = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
      const el = originalCreateElement(tag);
      if (tag === "a") {
        el.click = vi.fn();
        anchors.push(el as HTMLAnchorElement);
      }
      return el;
    });

    render(<FillRequestsPanel templateId="tpl-1" templateName="Contract" fields={fields} />);

    await user.click(await screen.findByRole("button", { name: /export values/i }));

    expect(anchors.at(-1)!.download).toBe("Contract.values.json");
    const [blob] = vi.mocked(URL.createObjectURL).mock.calls.at(-1)!;
    expect((blob as Blob).type).toBe("application/json");
    expect(JSON.parse(await (blob as Blob).text())).toEqual({ name: "Ada", city: "London" });

    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });
});
