import { beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { execute, query } from "@/data/client";
import { savePartnerDocument, savePartnerContributionReceipt, savePartnerPayoutReceipt, validatePartnerDocument, listDocuments, listProjectCostDocuments, saveActualCostBill, saveActualCostReceipt, saveConstructionCostReceipt, saveConstructionSupplierBill, saveLandImage, saveLandPaymentReceipt } from "@/data/repositories/documentsRepository";

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
    const file = { name: "plan.html", type: "text/html", size: 3 } as File;
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
    expect(query).toHaveBeenCalledWith(expect.stringContaining("COALESCE(l.project_id, t.project_id, s.project_id, ps.project_id"));
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

describe("partner documents", () => {
 beforeEach(() => {vi.clearAllMocks();});
 it("supports PDFs for both contribution and payout receipts", async () => {
  vi.mocked(invoke).mockResolvedValue("attachments/proof.pdf");
  vi.mocked(query).mockResolvedValue([{id:"doc"}]);
  const file = {name:"proof.pdf",type:"application/pdf",size:3,arrayBuffer:async()=>new Uint8Array([1,2,3]).buffer} as File;
  await savePartnerContributionReceipt("contribution",file,"2026-10-08","cash");
  expect(execute).toHaveBeenLastCalledWith(expect.any(String),expect.arrayContaining(["partner_contribution_receipt","contribution","application/pdf"]));
  await savePartnerPayoutReceipt("payout",file,"2026-10-08","bank");
  expect(execute).toHaveBeenLastCalledWith(expect.any(String),expect.arrayContaining(["partner_payout_receipt","payout"]));
 });
 it("links agreements to the specific partnership and rejects missing owners", async () => {
  const file = {name:"agreement.pdf",type:"application/pdf",size:3,arrayBuffer:async()=>new Uint8Array([1,2,3]).buffer} as File;
  vi.mocked(query).mockResolvedValue([]);
  await expect(savePartnerDocument("missing",file)).rejects.toThrow("not found");
  expect(invoke).not.toHaveBeenCalled();
  vi.mocked(query).mockResolvedValue([{id:"partnership"}]);
  vi.mocked(invoke).mockResolvedValue("attachments/agreement.pdf");
  await savePartnerDocument("partnership",file);
  expect(execute).toHaveBeenLastCalledWith(expect.stringContaining("'partnership'"),expect.arrayContaining(["partnership","agreement.pdf"]));
 });
 it("rejects empty, oversized and unsupported files", () => {
  for(const file of [{type:"application/pdf",size:0},{type:"image/png",size:10485761},{type:"text/html",size:10}]) expect(()=>validatePartnerDocument(file as File)).toThrow("10 MB");
 });
});
