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
  fireEvent.click(screen.getByRole("tab", { name: /Land documents/ }));
  expect(await screen.findByRole("heading", { name: "plot.png" })).toBeInTheDocument();
  expect(screen.getByText(/Baloch Residency/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /Open image/ }));
  await waitFor(() => expect(openDocument).toHaveBeenCalledWith("C:/app/attachments/plot.png"));
});

it("groups transfer and cheque proof under Bank receipts while keeping construction cash receipts separate", async () => {
  vi.mocked(listDocuments).mockResolvedValue([
    { id: "bank-1", title: "transfer.png", doc_type: "land_payment_receipt", doc_date: "2026-10-03", notes: "bank", file_path: "transfer.png", mime: "image/png", size: 3, owner_type: "land", owner_id: "land-1", project_name: "Baloch Residency", created_at: "2026-10-03" },
    { id: "cheque-1", title: "cheque.png", doc_type: "construction_cost_receipt", doc_date: "2026-10-03", notes: "cheque", file_path: "cheque.png", mime: "image/png", size: 3, owner_type: "transaction", owner_id: "cost-1", project_name: "Baloch Residency", created_at: "2026-10-03" },
    { id: "cash-1", title: "cash.png", doc_type: "construction_cost_receipt", doc_date: "2026-10-03", notes: "cash", file_path: "cash.png", mime: "image/png", size: 3, owner_type: "transaction", owner_id: "cost-2", project_name: "Another Project", created_at: "2026-10-03" },
    { id: "bill-1", title: "supplier-bill.png", doc_type: "construction_supplier_bill", doc_date: "2026-10-03", notes: null, file_path: "supplier-bill.png", mime: "image/png", size: 3, owner_type: "transaction", owner_id: "cost-1", project_name: "Baloch Residency", created_at: "2026-10-03" },
    { id: "actual-receipt", title: "survey-transfer.png", doc_type: "project_cost_receipt", doc_date: "2026-10-03", notes: "bank", file_path: "survey-transfer.png", mime: "image/png", size: 3, owner_type: "transaction", owner_id: "actual-1", project_name: "Baloch Residency", created_at: "2026-10-03" },
    { id: "actual-bill", title: "survey-bill.png", doc_type: "project_cost_bill", doc_date: "2026-10-03", notes: null, file_path: "survey-bill.png", mime: "image/png", size: 3, owner_type: "transaction", owner_id: "actual-1", project_name: "Baloch Residency", created_at: "2026-10-03" },
  ]);
  render(<DocumentsPage />);
  expect(await screen.findByRole("heading", { name: "transfer.png" })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "cheque.png" })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "survey-transfer.png" })).toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: "cash.png" })).not.toBeInTheDocument();
  expect(screen.getAllByText("Baloch Residency")).toHaveLength(3);
  fireEvent.click(screen.getByRole("tab", { name: /Construction receipts/ }));
  expect(screen.getByRole("heading", { name: "cash.png" })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "supplier-bill.png" })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "survey-bill.png" })).toBeInTheDocument();
  expect(screen.getByText("Supplier bill")).toBeInTheDocument();
  expect(screen.getByText("Another Project")).toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: "cheque.png" })).not.toBeInTheDocument();
});

it("shows flat and shop sale images in their own project-linked category", async () => {
  vi.mocked(listDocuments).mockResolvedValue([{
    id: "sale-doc-1", title: "agreement.png", doc_type: "project_sale_document",
    doc_date: "2026-10-04", notes: null, file_path: "agreement.png", mime: "image/png", size: 10,
    owner_type: "project_sale", owner_id: "sale-1", project_name: "Baloch Residency", created_at: "2026-10-04",
  }]);
  render(<DocumentsPage />);
  fireEvent.click(screen.getByRole("tab", { name: /Sales documents/ }));
  expect(await screen.findByRole("heading", { name: "agreement.png" })).toBeInTheDocument();
  expect(screen.getByText("Baloch Residency")).toBeInTheDocument();
  expect(screen.getByText("Flat or shop sale")).toBeInTheDocument();
});
