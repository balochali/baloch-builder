import { execute, query } from "@/data/client";
import { now } from "@/data/ids";
import { BankAccountSchema } from "@/domain/bankAccount";
import { CreateUdhaarSchema, type CreateUdhaarInput } from "./udhaarRepository";

/** Extra edit / remove helpers used by the Excel-style sheet views. Nothing is hard deleted
 *  except a deposit that has no returns (that table has no "archived" column). */

export async function updateSheetUdhaar(id: string, input: CreateUdhaarInput) {
  const v = CreateUdhaarSchema.parse(input);
  const rows = await query<{ contact_id: string | null; paid: number }>(
    `SELECT u.contact_id, COALESCE((SELECT SUM(p.amount) FROM udhaar_payments p
      WHERE p.udhaar_id = u.id AND p.archived = 0), 0) AS paid
     FROM udhaars u WHERE u.id = ? AND u.archived = 0`,
    [id],
  );
  const current = rows[0];
  if (!current) throw new Error("This record is no longer available. Refresh the sheet.");
  if (v.amount < current.paid)
    throw new Error("The amount cannot be less than what has already been paid back.");
  // A person chosen from Contacts keeps the name and phone saved in Contacts.
  const nameSql = current.contact_id ? "" : "borrower_name = ?, phone = ?, ";
  const nameValues = current.contact_id ? [] : [v.borrower_name, v.phone || null];
  await execute(
    `UPDATE udhaars SET ${nameSql}amount = ?, given_date = ?, due_date = ?, notes = ?,
      account_key = ?, updated_at = ? WHERE id = ? AND archived = 0`,
    [
      ...nameValues,
      v.amount,
      v.given_date,
      v.due_date,
      v.notes || null,
      BankAccountSchema.parse(v.account_key),
      now(),
      id,
    ],
  );
}

export async function archiveUdhaar(id: string) {
  const result = await execute(
    "UPDATE udhaars SET archived = 1, updated_at = ? WHERE id = ? AND archived = 0",
    [now(), id],
  );
  if (result.rowsAffected !== 1) throw new Error("This record is no longer available.");
}

export async function deleteSheetDeposit(id: string) {
  const returns = await query<{ n: number }>(
    "SELECT COUNT(*) AS n FROM deposit_returns WHERE deposit_id = ?",
    [id],
  );
  if (returns[0]?.n)
    throw new Error("Money has already been returned from this deposit, so it cannot be deleted.");
  const result = await execute("DELETE FROM personal_deposits WHERE id = ?", [id]);
  if (result.rowsAffected !== 1) throw new Error("This record is no longer available.");
}

export interface DepositReturnRow {
  id: string;
  holder_name: string;
  return_date: string;
  amount: number;
  account_key: string;
  method: string;
  notes: string;
}
export async function listAllDepositReturns(): Promise<DepositReturnRow[]> {
  return query<DepositReturnRow>(
    `SELECT r.id, d.holder_name, r.return_date, r.amount, r.account_key, r.method, r.notes
     FROM deposit_returns r JOIN personal_deposits d ON d.id = r.deposit_id
     ORDER BY r.return_date DESC, r.created_at DESC`,
  );
}

export async function archiveSheetSale(projectId: string, id: string) {
  const result = await execute(
    `UPDATE project_sales SET archived = 1, updated_at = ?
     WHERE id = ? AND project_id = ? AND kind IN ('flat', 'shop') AND archived = 0`,
    [now(), id, projectId],
  );
  if (result.rowsAffected !== 1) throw new Error("This record is no longer available.");
}

export async function archiveSheetTransaction(
  projectId: string,
  id: string,
  type: "project_cost" | "construction_cost" | "partner_contribution" | "partner_payout",
) {
  const result = await execute(
    `UPDATE transactions SET archived = 1, updated_at = ?
     WHERE id = ? AND project_id = ? AND type = ? AND archived = 0`,
    [now(), id, projectId, type],
  );
  if (result.rowsAffected !== 1) throw new Error("This record is no longer available.");
}
