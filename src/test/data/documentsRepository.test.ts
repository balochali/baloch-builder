import { beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { execute } from "@/data/client";
import { saveLandImage, saveLandPaymentReceipt } from "@/data/repositories/documentsRepository";

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
});
