import type { FeasibilityData } from "@baloch/shared";
export { costRow, salesRow, fundingRow, defaultFeasibility } from "@baloch/shared";

const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);
const pct = (numerator: number, denominator: number) =>
  denominator ? (numerator / denominator) * 100 : null;
export const range = (min?: number, max?: number) => ({
  min: min ?? max ?? 0,
  max: max ?? min ?? 0,
});
type Range = ReturnType<typeof range>;
function sumRanges(values: Range[]) {
  return { min: sum(values.map((v) => v.min)), max: sum(values.map((v) => v.max)) };
}
function scale(value: Range, factor: number) {
  return { min: value.min * factor, max: value.max * factor };
}
export function calculateFeasibility(plan: FeasibilityData) {
  const direct = plan.costCategories.map((c) =>
    sumRanges(c.rows.map((r) => range(r.minAmount, r.maxAmount))),
  );
  const base = sumRanges(
    direct.filter((_, i) => plan.costCategories[i].contingencyPercent === undefined),
  );
  const subtotals = plan.costCategories.map((c, i) =>
    c.contingencyPercent === undefined ? direct[i] : scale(base, c.contingencyPercent / 100),
  );
  const cost = sumRanges(subtotals);
  const sales = plan.salesRows.map((row) => {
    const price = scale(range(row.minRatePerSqft, row.maxRatePerSqft), row.areaSqft);
    const total = scale(price, row.count);
    return { price, total, expected: scale(total, row.soldPercent / 100) };
  });
  const value = sumRanges(sales.map((s) => s.total)),
    expected = sumRanges(sales.map((s) => s.expected));
  const profit = { worst: expected.min - cost.max, best: expected.max - cost.min };
  const capital = sum(plan.partners.map((p) => p.capital));
  const returns = plan.partners.map((p) => {
    const capitalPercent = pct(p.capital, capital) ?? 0;
    const share = p.profitSharePercent ?? capitalPercent;
    const scenario = (profit: number) => {
      const gain = (profit * share) / 100;
      return { gain, total: p.capital + gain, roi: pct(gain, p.capital) };
    };
    return { capitalPercent, share, worst: scenario(profit.worst), best: scenario(profit.best) };
  });
  return {
    cost,
    subtotals,
    sales,
    value,
    expected,
    profit,
    capital,
    returns,
    margin: { worst: pct(profit.worst, expected.min), best: pct(profit.best, expected.max) },
    breakEven: { worst: pct(cost.max, value.min), best: pct(cost.min, value.max) },
    gap: { min: cost.min - capital, max: cost.max - capital },
    share: sum(returns.map((r) => r.share)),
    units: sum(plan.salesRows.map((r) => r.count)),
  };
}
