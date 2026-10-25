import type { Row } from "./Grid";
import { isBlankLine } from "./voucherGrid";
export function resolveHead(value: unknown, heads: Row[]) {
  const key = String(value ?? "")
    .trim()
    .toLowerCase();
  if (!key) return undefined;
  const code = heads.find((h) => String(h.code).toLowerCase() === key);
  if (code) return code;
  const names = heads.filter((h) => String(h.name).toLowerCase() === key);
  return names.length === 1 ? names[0] : undefined;
}
export function tagVoucherRows(rows: Row[], accounts: Row[], heads: Row[]): Row[] {
  return rows.map((row) => {
    if (isBlankLine(row)) return { ...row, cost_head_error: "" };
    const head = resolveHead(row.cost_head, heads);
    const account =
      row.account || accounts.find((a) => a.id === head?.default_account_id)?.code || "";
    const required = accounts.find((a) => a.code === account)?.requiresCostHead === true;
    const error =
      row.cost_head && (!head || !head.active || head.budget_only)
        ? "Choose an active, non-budget-only cost head"
        : required && !head
          ? "Cost head required for this WIP account"
          : "";
    return {
      ...row,
      account,
      cost_head: head?.code ?? row.cost_head ?? "",
      cost_head_error: error,
    };
  });
}
