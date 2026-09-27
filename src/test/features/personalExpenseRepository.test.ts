import { beforeEach, describe, expect, it, vi } from "vitest";
import { archivePersonalExpense, createPersonalExpense, updatePersonalExpense } from "@/data/repositories/personalExpenseRepository";
import { execute } from "@/data/client";

vi.mock("@/data/client", () => ({ query: vi.fn(), execute: vi.fn() }));

const purchase = { category: "other" as const, item_name: "Furniture", amount: 75_000,
  purchase_date: "2026-09-24", notes: "Living room" };

describe("personal purchases", () => {
  beforeEach(() => { vi.clearAllMocks(); vi.mocked(execute).mockResolvedValue({ rowsAffected: 1 }); });

  it("saves a named purchase in the Other category", async () => {
    await createPersonalExpense(purchase);
    expect(execute).toHaveBeenCalledWith(expect.stringContaining("INSERT INTO personal_expenses"),
      expect.arrayContaining(["other", "Furniture", 75_000, "2026-09-24"]));
  });

  it("rejects an unnamed Other purchase", async () => {
    await expect(createPersonalExpense({ ...purchase, item_name: " " })).rejects.toThrow();
    expect(execute).not.toHaveBeenCalled();
  });

  it("updates and archives a purchase", async () => {
    await updatePersonalExpense("purchase-1", { ...purchase, amount: 80_000 });
    await archivePersonalExpense("purchase-1");
    expect(execute).toHaveBeenNthCalledWith(1, expect.stringContaining("UPDATE personal_expenses SET category"),
      expect.arrayContaining(["Furniture", 80_000, "purchase-1"]));
    expect(execute).toHaveBeenNthCalledWith(2, expect.stringContaining("archived = 1"),
      expect.arrayContaining(["purchase-1"]));
  });
});
