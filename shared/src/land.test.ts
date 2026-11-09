import { describe, it, expect } from "vitest";
import {
  splitTotal,
  fundingBreakdown,
  landRemaining,
  paymentProblem,
  landSourceLines,
  landPaymentSchema,
} from "./land";
import { validatePosting } from "./journal";
describe("land accounting", () => {
  const sources = [
    { sourceType: "bank" as const, amount: 6000000 },
    {
      sourceType: "partner_direct" as const,
      partnerId: "a48da60c-f2e4-4c84-b100-89cd8d57c261",
      amount: 4000000,
    },
  ];
  it("totals split sources and balances one voucher", () => {
    expect(splitTotal(sources)).toBe(10000000);
    expect(() =>
      validatePosting(landSourceLines(sources, "project", "2010", "seller")),
    ).not.toThrow();
  });
  it("aggregates named funding percentages", () => {
    const rows = fundingBreakdown([...sources, { sourceType: "bank", amount: 10000000 }]);
    expect(rows.map((r) => r.percentage)).toEqual([80, 20]);
    expect(fundingBreakdown([])).toEqual([]);
  });
  it("calculates remaining and blocks overpayment", () => {
    expect(landRemaining(60000000, 35000000)).toBe(25000000);
    expect(paymentProblem(sources, 9999999)).toMatch(/remaining/);
    expect(paymentProblem(sources, 10000000)).toBe("");
    expect(paymentProblem([{ sourceType: "cash", amount: 0 }], 100)).toMatch(/positive/);
  });
  it("requires identities, whole rupees and valid dates", () => {
    const base = { purchaseId: sources[1].partnerId, paidOn: "2026-01-01", sources };
    expect(landPaymentSchema.safeParse(base).success).toBe(true);
    for (const patch of [
      { paidOn: "2999-01-01" },
      { sources: [{ sourceType: "partner_direct", amount: 1 }] },
      { sources: [{ sourceType: "cash", amount: 1.5 }] },
    ])
      expect(landPaymentSchema.safeParse({ ...base, ...patch }).success).toBe(false);
  });
});
