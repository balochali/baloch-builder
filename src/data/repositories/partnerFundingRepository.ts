import { execute, query } from "@/data/client";
import { newId, now } from "@/data/ids";
import { listProjectPartners } from "./projectPartnersRepository";
export interface FundingAllocation {
  partner_id: string;
  name: string;
  share_bp: number;
  amount: number;
}
export interface FundingRound {
  id: string;
  project_id: string;
  title: string;
  amount: number;
  allocations: string;
  created_at: string;
}
export function allocateFunding(
  amount: number,
  partners: { partner_id: string; name: string; share_bp: number }[],
): FundingAllocation[] {
  if (!Number.isSafeInteger(amount) || amount <= 0)
    throw new Error("Enter a positive amount in whole rupees");
  if (!partners.length || partners.reduce((sum, p) => sum + p.share_bp, 0) !== 10000)
    throw new Error("Partner shares must total 100% before requesting construction money");
  const sorted = [...partners].sort((a, b) => a.partner_id.localeCompare(b.partner_id));
  const allocations = sorted.map((p) => ({
    ...p,
    amount: Number((BigInt(amount) * BigInt(p.share_bp)) / 10000n),
  }));
  let remainder = amount - allocations.reduce((sum, p) => sum + p.amount, 0);
  const ranking = sorted
    .map((p, i) => ({ i, fraction: Number((BigInt(amount) * BigInt(p.share_bp)) % 10000n) }))
    .sort((a, b) => b.fraction - a.fraction);
  for (const item of ranking) {
    if (remainder-- <= 0) break;
    allocations[item.i].amount++;
  }
  return allocations;
}
export function listFundingRounds(projectId: string) {
  return query<FundingRound>(
    "SELECT * FROM partner_funding_rounds WHERE project_id = ? ORDER BY created_at DESC, id",
    [projectId],
  );
}
export async function addFundingRound(projectId: string, title: string, amount: number) {
  if (!title.trim() || title.trim().length > 120)
    throw new Error("Enter a construction request name, up to 120 characters");
  const allocations = allocateFunding(amount, await listProjectPartners(projectId));
  await execute(
    "INSERT INTO partner_funding_rounds(id,project_id,title,amount,allocations,created_at) VALUES (?,?,?,?,?,?)",
    [newId(), projectId, title.trim(), amount, JSON.stringify(allocations), now()],
  );
}
