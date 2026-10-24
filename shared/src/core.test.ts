import { describe, it, expect } from "vitest";
import { parseAmount, formatPKR, can, voucherSchema } from "./index";
describe("exact money", () => {
  it("preserves paisa beyond number precision", () => {
    expect(parseAmount("90,071,992,547,409.93")).toBe(9007199254740993n);
    expect(formatPKR(-101n)).toBe("-Rs 1.01");
  });
  it("rejects lossy inputs", () => {
    for (const v of ["1.001", "1e5", "NaN", "12abc", ""]) expect(() => parseAmount(v)).toThrow();
  });
});
it("denies financial access to operational roles", () => {
  for (const role of ["sales", "construction"] as const)
    for (const p of ["ledger", "accounts", "audit", "users", "settings", "periods"] as const)
      expect(can(role, p)).toBe(false);
  expect(can("accountant", "users")).toBe(false);
});
it("rejects two-sided lines", () =>
  expect(voucherSchema.safeParse({ date: "2026-10-24", type: "JV", lines: [] }).success).toBe(
    false,
  ));
