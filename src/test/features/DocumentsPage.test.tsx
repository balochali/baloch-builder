import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { DocumentsPage } from "@/features/documents/pages/DocumentsPage";
import { listDocuments, openDocument } from "@/data/repositories/documentsRepository";

vi.mock("@/data/repositories/documentsRepository", () => ({
  listDocuments: vi.fn(),
  openDocument: vi.fn(),
}));

it("lists saved land images and opens the attachment", async () => {
  vi.mocked(listDocuments).mockResolvedValue([
    {
      id: "doc-1",
      title: "plot.png",
      doc_type: "land_image",
      doc_date: "2026-10-03",
      notes: null,
      file_path: "C:/app/attachments/plot.png",
      mime: "image/png",
      size: 3,
      owner_type: "land",
      owner_id: "land-1",
      project_name: "Baloch Residency",
      created_at: "2026-10-03",
    },
  ]);
  vi.mocked(openDocument).mockResolvedValue();
  render(<DocumentsPage />);
  expect(await screen.findByRole("heading", { name: "plot.png" })).toBeInTheDocument();
  expect(screen.getByText(/Baloch Residency/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Open image" }));
  await waitFor(() => expect(openDocument).toHaveBeenCalledWith("C:/app/attachments/plot.png"));
});
