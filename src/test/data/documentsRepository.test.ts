import { beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { execute, query } from "@/data/client";
import { listDocuments, listProjectCostDocuments, saveActualCostBill, saveActualCostReceipt, saveConstructionCostReceipt, saveConstructionSupplierBill, saveLandImage, saveLandPaymentReceipt } from "@/data/repositories/documentsRepository";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@/data/client", () => ({ execute: vi.fn(), query: vi.fn() }));

describe("land image documents", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("copies an image and records it against the land", async () => {
    vi.mocked(invoke).mockResolvedValue("C:/app/attachments/land-image.png");
    vi.mocked(execute).mockResolvedValue({ rowsAffected: 1 });
    const file = {
      name: "plot.png",
      type: "image/png",
      size: 3,
      arrayBuffer: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3]).buffer),
    } as unknown as File;
    await saveLandImage("land-1", file, "2026-10-03");
    expect(invoke).toHaveBeenCalledWith("save_image_attachment", {
      bytes: [1, 2, 3],
      mime: "image/png",
    });
    expect(execute).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO documents"),
      expect.arrayContaining([
        "plot.png",
        "2026-10-03",
        "C:/app/attachments/land-image.png",
        "land-1",
      ]),
    );
  });

  it("rejects files that are not supported images", async () => {
    const file = { name: "plan.pdf", type: "application/pdf", size: 3 } as File;
    await expect(saveLandImage("land-1", file, "2026-10-03")).rejects.toThrow("JPEG");
    expect(invoke).not.toHaveBeenCalled();
  });

  it("stores payment proof as a receipt linked to the land and method", async () => {
    vi.mocked(invoke).mockResolvedValue("C:/app/attachments/receipt.png");
    vi.mocked(execute).mockResolvedValue({ rowsAffected: 1 });
    const file = {
      name: "transfer.png",
      type: "image/png",
      size: 3,
      arrayBuffer: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3]).buffer),
    } as unknown as File;
    await saveLandPaymentReceipt("land-1", file, "2026-10-03", "bank");
    expect(execute).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO documents"),
      expect.arrayContaining(["land_payment_receipt", "bank", "land-1"]),
    );
  });

  it("loads the project and payment method for older transaction receipts", async () => {
    vi.mocked(query).mockResolvedValue([]);
    await listDocuments();
    expect(query).toHaveBeenCalledWith(expect.stringContaining("COALESCE(d.notes, t.method) AS notes"));
    expect(query).toHaveBeenCalledWith(expect.stringContaining("COALESCE(l.project_id, t.project_id, s.project_id)"));
    await listProjectCostDocuments("project-1");
    expect(query).toHaveBeenCalledWith(expect.stringContaining("'project_cost_bill'"), ["project-1"]);
  });

  it("stores construction cheque receipts with their payment method", async () => {
    vi.mocked(invoke).mockResolvedValue("C:/app/attachments/cheque.png");
    vi.mocked(execute).mockResolvedValue({ rowsAffected: 1 });
    vi.mocked(query).mockResolvedValue([{ id: "document-1", title: "cheque.png" }]);
    const file = {
      name: "cheque.png", type: "image/png", size: 3,
      arrayBuffer: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3]).buffer),
    } as unknown as File;
    await saveConstructionCostReceipt("transaction-1", file, "2026-10-03", "cheque");
    expect(execute).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO documents"),
      expect.arrayContaining(["cheque.png", "construction_cost_receipt", "cheque", "transaction-1"]),
    );
    await saveConstructionSupplierBill("transaction-1", file, "2026-10-03");
    expect(execute).toHaveBeenLastCalledWith(
      expect.stringContaining("INSERT INTO documents"),
      expect.arrayContaining(["cheque.png", "construction_supplier_bill", "transaction-1"]),
    );
    await saveActualCostReceipt("transaction-2", file, "2026-10-03", "bank");
    expect(execute).toHaveBeenLastCalledWith(expect.stringContaining("INSERT INTO documents"), expect.arrayContaining(["project_cost_receipt", "bank", "transaction-2"]));
    await saveActualCostBill("transaction-2", file, "2026-10-03");
    expect(execute).toHaveBeenLastCalledWith(expect.stringContaining("INSERT INTO documents"), expect.arrayContaining(["project_cost_bill", "transaction-2"]));
  });
});
