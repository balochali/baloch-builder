import {
  estimateCosts,
  salesEstimateTotals,
  parseAmount,
  workbookData,
  workbookSchemas,
} from "@baloch/shared";
import type { Row } from "./Grid";
export type PartnerPlan = { name: string; share: string };
export function equalPartners(count: number): PartnerPlan[] {
  const base = Math.floor(10000 / count),
    rest = 10000 % count;
  return Array.from({ length: count }, (_, i) => ({
    name: `Partner ${i + 1}`,
    share: ((base + (i < rest ? 1 : 0)) / 100).toFixed(2),
  }));
}
export function sharePoints(value: string) {
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(value)) return null;
  const [whole, fraction = ""] = value.split(".");
  const points = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return points <= 10000 ? points : null;
}
export function allocation(amount: bigint, points: number) {
  const absolute = amount < 0n ? -amount : amount;
  const result = (absolute * BigInt(points) + 5000n) / 10000n;
  return amount < 0n ? -result : result;
}
export function overviewTotals(costs: Row[], sales: Row[], marla: string) {
  let minCost = 0n,
    maxCost = 0n,
    minSales = 0n,
    maxSales = 0n,
    costCount = 0,
    salesCount = 0,
    excluded = 0;
  for (const row of costs) {
    try {
      workbookSchemas.estimate.parse(workbookData("estimate", row));
      const cost = estimateCosts(row),
        low = parseAmount(cost.minimumCost),
        high = parseAmount(cost.maximumCost);
      if (low > high) throw Error("Invalid range");
      minCost += low;
      maxCost += high;
      costCount++;
    } catch {
      excluded++;
    }
  }
  for (const row of sales) {
    try {
      workbookSchemas.sales_estimate.parse(workbookData("sales_estimate", row));
      const total = salesEstimateTotals(row, marla);
      minSales += total.minimumTotal;
      maxSales += total.maximumTotal;
      salesCount++;
    } catch {
      excluded++;
    }
  }
  return {
    minCost,
    maxCost,
    minSales,
    maxSales,
    minProfit: minSales - maxCost,
    maxProfit: maxSales - minCost,
    costCount,
    salesCount,
    excluded,
  };
}
