import { beforeEach, describe, expect, it, vi } from "vitest";
import { addUdhaarPayment } from "@/data/repositories/udhaarRepository";
import { execute, query } from "@/data/client";

vi.mock("@/data/client", () => ({ query: vi.fn(), execute: vi.fn() }));

describe("udhaar repayments", () => {
  beforeEach(() => {
    vi.mocked(query).mockResolvedValue([{ amount: 100_000, paid_amount: 30_000, given_date: "2026-09-01" }]);
    vi.mocked(execute).mockResolvedValue({ rowsAffected: 1 });
  });

  it("rejects a repayment larger than the outstanding balance", async () => {
    await expect(addUdhaarPayment({ udhaar_id: "11111111-1111-4111-8111-111111111111",
      amount: 70_001, paid_date: "2026-09-24", method: "cash", notes: "" }))
      .rejects.toThrow("Payment cannot exceed the remaining balance");
    expect(execute).not.toHaveBeenCalled();
  });

  it("records a repayment within the outstanding balance", async () => {
    await addUdhaarPayment({ udhaar_id: "11111111-1111-4111-8111-111111111111",
      amount: 70_000, paid_date: "2026-09-24", method: "bank", notes: "Transfer" });
    expect(execute).toHaveBeenCalledWith(expect.stringContaining("INSERT INTO udhaar_payments"),
      expect.arrayContaining([70_000, "2026-09-24", "bank"]));
  });
});
