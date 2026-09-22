/**
 * domain/balances.ts — Pure balance calculation functions.
 * No React, no DB, no Tauri imports.
 */

/**
 * How much of the land purchase price is still unpaid.
 * @param price Total land price (integer rupees)
 * @param payments Array of payment amounts (integer rupees, positive = paid)
 */
export function landRemainingPayable(price: number, payments: number[]): number {
  const totalPaid = payments.reduce((acc, p) => acc + Math.trunc(p), 0);
  return Math.trunc(price) - totalPaid;
}

/**
 * Net position of a partner: agreed contribution minus what they put in plus what they received.
 * Positive = they still owe money in. Negative = they are owed a payout.
 * @param agreed Agreed contribution (integer rupees)
 * @param contributions Actual contributions paid in (integer rupees each)
 * @param payouts Payouts sent to the partner (integer rupees each)
 */
export function partnerPosition(
  agreed: number,
  contributions: number[],
  payouts: number[],
): number {
  const totalContrib = contributions.reduce((acc, c) => acc + Math.trunc(c), 0);
  const totalPayout = payouts.reduce((acc, p) => acc + Math.trunc(p), 0);
  // Remaining to contribute minus what has been paid back
  return Math.trunc(agreed) - totalContrib + totalPayout;
}

/**
 * Total investment into a project: land cost plus all other project costs.
 * @param landCost Land purchase price (integer rupees)
 * @param projectCosts Other project expenses (integer rupees each)
 */
export function projectInvestment(landCost: number, projectCosts: number[]): number {
  const totalCosts = projectCosts.reduce((acc, c) => acc + Math.trunc(c), 0);
  return Math.trunc(landCost) + totalCosts;
}

export interface ShareCheckResult {
  /** Sum of all share_bp values */
  total: number;
  /** True when total === 10000 (i.e., exactly 100.00%) */
  ok: boolean;
  /**
   * The implied owner/developer share in basis points.
   * 10000 - sum(partnerShareBps). May be negative if partners exceed 100%.
   */
  ownerShareBp: number;
}

/**
 * Validate that partnership shares sum correctly.
 * Shares use basis points: 10000 bp = 100.00%.
 * @param shareBps Array of partner share_bp values
 */
export function shareCheck(shareBps: number[]): ShareCheckResult {
  const total = shareBps.reduce((acc, s) => acc + Math.trunc(s), 0);
  const ownerShareBp = 10_000 - total;
  return { total, ok: total === 10_000, ownerShareBp };
}
