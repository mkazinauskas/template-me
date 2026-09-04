import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DownloadTemplateButton } from "@/components/download-template-button";
import { orpc } from "@/lib/orpc";

vi.mock("@/lib/orpc");

const downloadBlob = vi.fn();
vi.mock("@/lib/download", () => ({
  downloadBlob: (...args: unknown[]) => downloadBlob(...args),
}));

describe("DownloadTemplateButton", () => {
  beforeEach(() => {
    downloadBlob.mockReset();
    vi.mocked(orpc.templates.download).mockReset();
  });

  it("downloads the raw template file on click", async () => {
    const file = new File(["PK raw docx bytes"], "Offer_Letter.docx", {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });
    vi.mocked(orpc.templates.download).mockResolvedValue(file);
    const user = userEvent.setup();
    render(<DownloadTemplateButton templateId="t1" />);

    await user.click(screen.getByRole("button", { name: "Download original" }));

    expect(orpc.templates.download).toHaveBeenCalledWith({ id: "t1" });
    expect(await screen.findByRole("button", { name: "Download original" })).toBeInTheDocument();
    expect(downloadBlob).toHaveBeenCalledWith(file, "Offer_Letter.docx");
  });

  it("shows 'Downloading…' while in flight and re-enables on success", async () => {
    let resolveDownload!: (file: File) => void;
    vi.mocked(orpc.templates.download).mockReturnValue(
      new Promise((resolve) => {
        resolveDownload = resolve;
      })
    );
    const user = userEvent.setup();
    render(<DownloadTemplateButton templateId="t1" />);

    await user.click(screen.getByRole("button", { name: "Download original" }));
    expect(await screen.findByRole("button", { name: "Downloading…" })).toBeDisabled();

    resolveDownload(new File(["x"], "a.docx"));

    const button = await screen.findByRole("button", { name: "Download original" });
    expect(button).not.toBeDisabled();
  });

  it("shows an error message and re-enables on failure", async () => {
    vi.mocked(orpc.templates.download).mockRejectedValue(new Error("Template not found"));
    const user = userEvent.setup();
    render(<DownloadTemplateButton templateId="t1" />);

    await user.click(screen.getByRole("button", { name: "Download original" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Template not found");
    expect(screen.getByRole("button", { name: "Download original" })).not.toBeDisabled();
    expect(downloadBlob).not.toHaveBeenCalled();
  });
});
