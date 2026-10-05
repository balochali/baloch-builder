import { beforeEach, describe, expect, it, vi } from "vitest";
import { execute, query } from "@/data/client";
import { addProjectSale, listProjectSales, type ProjectSaleInput } from "@/data/repositories/projectSalesRepository";

vi.mock("@/data/client", () => ({ execute: vi.fn(), query: vi.fn() }));

const input: ProjectSaleInput = {
  project_id: "11111111-1111-4111-8111-111111111111",
  kind: "flat", floor_index: 2, unit_number: "A-201", rooms: 3,
  buyer_name: "Ali", buyer_phone: "03001234567", buyer_address: "Quetta",
  sale_date: "2026-10-04", price: 7_500_000, notes: "Agreement signed",
};

describe("project sales", () => {
  beforeEach(() => vi.clearAllMocks());

  it("saves the exact unit, buyer and agreed price against a project", async () => {
    vi.mocked(execute).mockResolvedValue({ rowsAffected: 1 });
    vi.mocked(query).mockResolvedValue([{ id: "sale-1", ...input }]);
    const row = await addProjectSale(input);
    expect(row.id).toBe("sale-1");
    expect(execute).toHaveBeenCalledWith(expect.stringContaining("INSERT INTO project_sales"),
      expect.arrayContaining([input.project_id, "flat", 2, "A-201", 3, "Ali", 7_500_000]));
    await listProjectSales(input.project_id);
    expect(query).toHaveBeenCalledWith(expect.stringContaining("WHERE project_id = ? AND archived = 0"), [input.project_id]);
  });

  it("rejects a duplicated sold unit with a helpful error", async () => {
    vi.mocked(execute).mockRejectedValue(new Error("UNIQUE constraint failed: project_sales.project_id"));
    await expect(addProjectSale(input)).rejects.toThrow("already recorded as sold");
  });

  it("requires a positive whole-rupee price", async () => {
    await expect(addProjectSale({ ...input, price: 0 })).rejects.toThrow();
    expect(execute).not.toHaveBeenCalled();
  });
});
