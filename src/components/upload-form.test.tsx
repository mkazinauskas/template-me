import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { UploadForm } from "@/components/upload-form";

const push = vi.fn();
const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh }),
}));

function docxFile(name = "template.docx") {
  return new File(["dummy content"], name, {
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
}

describe("UploadForm", () => {
  beforeEach(() => {
    push.mockReset();
    refresh.mockReset();
    vi.stubGlobal("fetch", vi.fn());
  });

  it("shows a validation error when submitting without a file", async () => {
    const user = userEvent.setup();
    render(<UploadForm />);

    await user.click(screen.getByRole("button", { name: "Upload template" }));

    expect(await screen.findByText("Choose a .docx file first")).toBeInTheDocument();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("uploads the chosen file and navigates to the new template on success", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ template: { id: "new-id" }, warnings: [] }),
    });
    const user = userEvent.setup();
    render(<UploadForm />);

    const fileInput = screen.getByLabelText("Word document (.docx)") as HTMLInputElement;
    await user.upload(fileInput, docxFile());
    await user.type(screen.getByLabelText("Template name (optional)"), "Offer Letter");
    await user.click(screen.getByRole("button", { name: "Upload template" }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/templates/new-id"));
    expect(refresh).toHaveBeenCalled();

    const [, options] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(options.method).toBe("POST");
    const body = options.body as FormData;
    expect((body.get("file") as File).name).toBe("template.docx");
    expect(body.get("name")).toBe("Offer Letter");
  });

  it("prefills the template name from the chosen file name", async () => {
    const user = userEvent.setup();
    render(<UploadForm />);

    await user.upload(screen.getByLabelText("Word document (.docx)"), docxFile("Offer Letter.docx"));

    expect(screen.getByLabelText("Template name (optional)")).toHaveValue("Offer Letter");
  });

  it("does not overwrite a manually entered template name when a file is chosen", async () => {
    const user = userEvent.setup();
    render(<UploadForm />);

    await user.type(screen.getByLabelText("Template name (optional)"), "Custom Name");
    await user.upload(screen.getByLabelText("Word document (.docx)"), docxFile("Offer Letter.docx"));

    expect(screen.getByLabelText("Template name (optional)")).toHaveValue("Custom Name");
  });

  it("appends warnings as a query param when the upload returns warnings", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ template: { id: "new-id" }, warnings: ["Field \"x\" is odd"] }),
    });
    const user = userEvent.setup();
    render(<UploadForm />);

    await user.upload(screen.getByLabelText("Word document (.docx)"), docxFile());
    await user.click(screen.getByRole("button", { name: "Upload template" }));

    await waitFor(() =>
      expect(push).toHaveBeenCalledWith(
        `/templates/new-id?warnings=${encodeURIComponent(JSON.stringify(["Field \"x\" is odd"]))}`
      )
    );
  });

  it("shows the server error message when the upload fails", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      json: async () => ({ error: "No templated fields found." }),
    });
    const user = userEvent.setup();
    render(<UploadForm />);

    await user.upload(screen.getByLabelText("Word document (.docx)"), docxFile());
    await user.click(screen.getByRole("button", { name: "Upload template" }));

    expect(await screen.findByText("No templated fields found.")).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });

  it("shows a generic error message when the fetch itself throws", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("network down"));
    const user = userEvent.setup();
    render(<UploadForm />);

    await user.upload(screen.getByLabelText("Word document (.docx)"), docxFile());
    await user.click(screen.getByRole("button", { name: "Upload template" }));

    expect(await screen.findByText("Upload failed")).toBeInTheDocument();
  });
});
