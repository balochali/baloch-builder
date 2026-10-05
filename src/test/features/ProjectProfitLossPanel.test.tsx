import { describe, expect, it } from "vitest";
import { calculateProjectResult } from "@/features/projects/components/ProjectProfitLossPanel";

describe("project result and partner allocation", () => {
  it("compares contracted sales with all recorded costs and allocates by ownership share", () => {
    const result = calculateProjectResult(
      [{ price: 20_000_000 }, { price: 5_000_000 }],
      [{ amount: 8_000_000 }, { amount: 2_000_000 }],
      [{ name: "Bilal", share_bp: 4000 }, { name: "Ali", share_bp: 3000 }],
    );
    expect(result).toEqual({
      saleValue: 25_000_000, spent: 10_000_000, result: 15_000_000,
      allocations: [
        { name: "Bilal", share_bp: 4000, amount: 6_000_000 },
        { name: "Ali", share_bp: 3000, amount: 4_500_000 },
      ],
      unallocated: 4_500_000,
    });
  });

  it("shows proportional loss exposure without inventing a payout", () => {
    const result = calculateProjectResult(
      [{ price: 3_000_000 }], [{ amount: 5_000_000 }],
      [{ name: "Bilal", share_bp: 5000 }, { name: "Ali", share_bp: 5000 }],
    );
    expect(result.result).toBe(-2_000_000);
    expect(result.allocations.map((partner) => partner.amount)).toEqual([-1_000_000, -1_000_000]);
    expect(result.unallocated).toBe(0);
  });
});
