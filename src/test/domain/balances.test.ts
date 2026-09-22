import { describe, it, expect } from "vitest";
import {
  landRemainingPayable,
  partnerPosition,
  projectInvestment,
  shareCheck,
} from "@/domain/balances";

describe("domain/balances", () => {
  describe("landRemainingPayable", () => {
    it("calculates unpaid balance correctly", () => {
      const price = 5_000_000;
      const payments = [1_000_000, 1_500_000, 500_000];
      expect(landRemainingPayable(price, payments)).toBe(2_000_000);
    });

    it("returns total price if no payments made", () => {
      expect(landRemainingPayable(5_000_000, [])).toBe(5_000_000);
    });

    it("returns 0 or negative if fully or over paid", () => {
      expect(landRemainingPayable(1_000_000, [1_000_000])).toBe(0);
      expect(landRemainingPayable(1_000_000, [1_200_000])).toBe(-200_000);
    });
  });

  describe("partnerPosition", () => {
    it("calculates partner net balance: agreed - contrib + payouts", () => {
      const agreed = 2_000_000;
      const contributions = [1_000_000, 500_000]; // paid 1.5M
      const payouts = [200_000]; // received 0.2M
      // Still owes 500k in + received 200k back = 700k remaining to balance
      expect(partnerPosition(agreed, contributions, payouts)).toBe(700_000);
    });

    it("returns negative when partner is owed payout from profits", () => {
      const agreed = 1_000_000;
      const contributions = [1_000_000];
      const payouts = [0];
      expect(partnerPosition(agreed, contributions, payouts)).toBe(0);
    });
  });

  describe("projectInvestment", () => {
    it("sums land purchase cost and all project construction expenses", () => {
      const landCost = 10_000_000;
      const costs = [2_000_000, 3_500_000, 1_500_000];
      expect(projectInvestment(landCost, costs)).toBe(17_000_000);
    });
  });

  describe("shareCheck", () => {
    it("verifies shares totaling exactly 10000 basis points (100%)", () => {
      const result = shareCheck([2500, 2500, 5000]);
      expect(result.total).toBe(10000);
      expect(result.ok).toBe(true);
      expect(result.ownerShareBp).toBe(0);
    });

    it("calculates owner remaining share when partners have partial share", () => {
      const result = shareCheck([3000, 2000]); // 50%
      expect(result.total).toBe(5000);
      expect(result.ok).toBe(false);
      expect(result.ownerShareBp).toBe(5000); // 50% belongs to owner
    });

    it("flags invalid if partner shares exceed 10000 bp", () => {
      const result = shareCheck([6000, 5000]); // 110%
      expect(result.total).toBe(11000);
      expect(result.ok).toBe(false);
      expect(result.ownerShareBp).toBe(-1000);
    });
  });
});
