import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { UploadForm } from "@/components/upload-form";
import { ORPCError, orpc } from "@/lib/orpc";

vi.mock("@/lib/orpc");

const push = vi.fn();
const refresh = vi.fn();
const blobUpload = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh }),
}));

vi.mock("@vercel/blob/client", () => ({
  upload: (...args: unknown[]) => blobUpload(...args),
}));

const createMock = () => vi.mocked(orpc.templates.create);

function docxFile(name = "template.docx") {
  return new File(["dummy content"], name, {
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
}

describe("UploadForm", () => {
  beforeEach(() => {
    push.mockReset();
    refresh.mockReset();
    blobUpload.mockReset();
    createMock().mockReset().mockResolvedValue({ template: { id: "new-id" }, warnings: [] } as never);
  });

  it("shows a validation error when submitting without a file", async () => {
    const user = userEvent.setup();
    render(<UploadForm localMode />);

    await user.click(screen.getByRole("button", { name: "Upload template" }));

    expect(await screen.findByText("Choose a .docx file first")).toBeInTheDocument();
    expect(orpc.templates.create).not.toHaveBeenCalled();
  });

  it("uploads the chosen file and navigates to the new template on success", async () => {
    const user = userEvent.setup();
    render(<UploadForm localMode />);

    const fileInput = screen.getByLabelText("Word document (.docx)") as HTMLInputElement;
    await user.upload(fileInput, docxFile());
    await user.type(screen.getByLabelText("Template name (optional)"), "Offer Letter");
    await user.click(screen.getByRole("button", { name: "Upload template" }));

    await waitFor(() =>
      expect(push).toHaveBeenCalledWith("/client/dashboard/templates/new-id")
    );
    expect(refresh).toHaveBeenCalled();

    const [arg] = createMock().mock.calls[0];
    const { file, name } = arg as { file: File; name?: string };
    expect(file.name).toBe("template.docx");
    expect(name).toBe("Offer Letter");
  });

  it("prefills the template name from the chosen file name", async () => {
    const user = userEvent.setup();
    render(<UploadForm localMode />);

    await user.upload(screen.getByLabelText("Word document (.docx)"), docxFile("Offer Letter.docx"));

    expect(screen.getByLabelText("Template name (optional)")).toHaveValue("Offer Letter");
  });

  it("does not overwrite a manually entered template name when a file is chosen", async () => {
    const user = userEvent.setup();
    render(<UploadForm localMode />);

    await user.type(screen.getByLabelText("Template name (optional)"), "Custom Name");
    await user.upload(screen.getByLabelText("Word document (.docx)"), docxFile("Offer Letter.docx"));

    expect(screen.getByLabelText("Template name (optional)")).toHaveValue("Custom Name");
  });

  it("appends warnings as a query param when the upload returns warnings", async () => {
    createMock().mockResolvedValue({
      template: { id: "new-id" },
      warnings: ['Field "x" is odd'],
    } as never);
    const user = userEvent.setup();
    render(<UploadForm localMode />);

    await user.upload(screen.getByLabelText("Word document (.docx)"), docxFile());
    await user.click(screen.getByRole("button", { name: "Upload template" }));

    await waitFor(() =>
      expect(push).toHaveBeenCalledWith(
        `/client/dashboard/templates/new-id?warnings=${encodeURIComponent(JSON.stringify(["Field \"x\" is odd"]))}`
      )
    );
  });

  it("shows the server error message when the upload fails", async () => {
    createMock().mockRejectedValue(
      new ORPCError("BAD_REQUEST", { message: "No templated fields found." })
    );
    const user = userEvent.setup();
    render(<UploadForm localMode />);

    await user.upload(screen.getByLabelText("Word document (.docx)"), docxFile());
    await user.click(screen.getByRole("button", { name: "Upload template" }));

    expect(await screen.findByText("No templated fields found.")).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });

  it("shows the thrown error's message when the request itself throws", async () => {
    createMock().mockRejectedValue(new Error("network down"));
    const user = userEvent.setup();
    render(<UploadForm localMode />);

    await user.upload(screen.getByLabelText("Word document (.docx)"), docxFile());
    await user.click(screen.getByRole("button", { name: "Upload template" }));

    expect(await screen.findByText("network down")).toBeInTheDocument();
  });

  it("falls back to a generic error message for a non-Error rejection", async () => {
    createMock().mockRejectedValue("boom");
    const user = userEvent.setup();
    render(<UploadForm localMode />);

    await user.upload(screen.getByLabelText("Word document (.docx)"), docxFile());
    await user.click(screen.getByRole("button", { name: "Upload template" }));

    expect(await screen.findByText("Upload failed")).toBeInTheDocument();
  });
});

describe("UploadForm (not localMode — client-direct-to-Blob)", () => {
  beforeEach(() => {
    push.mockReset();
    refresh.mockReset();
    blobUpload.mockReset();
    createMock().mockReset().mockResolvedValue({ template: { id: "new-id" }, warnings: [] } as never);
  });

  it("uploads straight to Blob, then finalizes by referencing the stored object", async () => {
    blobUpload.mockResolvedValue({
      url: "https://blob.example/templates/uuid-offer.docx",
      pathname: "templates/uuid-offer.docx",
    });
    const user = userEvent.setup();
    render(<UploadForm localMode={false} />);

    await user.type(screen.getByLabelText("Template name (optional)"), "Offer Letter");
    await user.upload(screen.getByLabelText("Word document (.docx)"), docxFile());
    await user.click(screen.getByRole("button", { name: "Upload template" }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/client/dashboard/templates/new-id"));

    expect(blobUpload).toHaveBeenCalledTimes(1);
    const [pathname, , options] = blobUpload.mock.calls[0];
    expect(pathname).toMatch(/^templates\/.+-template\.docx$/);
    expect(options).toMatchObject({ access: "private", handleUploadUrl: "/api/templates/upload" });

    expect(orpc.templates.create).toHaveBeenCalledWith({
      blobUrl: "https://blob.example/templates/uuid-offer.docx",
      blobPathname: "templates/uuid-offer.docx",
      originalFilename: "template.docx",
      name: "Offer Letter",
    });
  });

  it("shows the Blob upload's own error (e.g. a size-cap rejection) without ever calling the API", async () => {
    blobUpload.mockRejectedValue(new Error("The uploaded file's size exceeds the maximum allowed size"));
    const user = userEvent.setup();
    render(<UploadForm localMode={false} />);

    await user.upload(screen.getByLabelText("Word document (.docx)"), docxFile());
    await user.click(screen.getByRole("button", { name: "Upload template" }));

    expect(
      await screen.findByText("The uploaded file's size exceeds the maximum allowed size")
    ).toBeInTheDocument();
    expect(orpc.templates.create).not.toHaveBeenCalled();
  });
});
