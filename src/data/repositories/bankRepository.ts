import { query, execute } from "@/data/client";
import { BankAccountSchema, type BankAccount } from "@/domain/bankAccount";
export interface BankEntry {
  id: string;
  source: string;
  source_id: string;
  account_key: BankAccount | null;
  date: string;
  amount: number;
  direction: "in" | "out";
  category: string;
  person: string;
  description: string;
  method: string;
  project: string;
  project_id: string | null;
}
/** Read the original records directly so edits, archives and Udhaar deletion stay in sync. */
export async function listBankEntries(): Promise<BankEntry[]> {
  return query<BankEntry>(`SELECT * FROM (
    SELECT 'transaction:' || t.id AS id, 'transactions' AS source, t.id AS source_id, t.account_key,
      t.date, t.amount, t.direction,
      CASE t.type WHEN 'partner_contribution' THEN 'Partner contribution' WHEN 'construction_cost' THEN 'Construction payment' ELSE 'Project payment' END AS category,
      COALESCE(c.name, '') AS person, COALESCE(t.description, '') AS description, COALESCE(t.method, 'Not recorded') AS method,
      COALESCE(pr.name, '') AS project, t.project_id
    FROM transactions t LEFT JOIN contacts c ON c.id = t.contact_id LEFT JOIN projects pr ON pr.id = t.project_id WHERE t.archived = 0
    UNION ALL
    SELECT 'udhaar:' || u.id, 'udhaars', u.id, u.account_key, u.given_date, u.amount, 'out', 'Udhaar given',
      COALESCE(c.name, u.borrower_name), COALESCE(u.notes, ''), COALESCE(json_extract(u.custom, '$.payment_details.method'), 'Not recorded'), '', NULL
    FROM udhaars u LEFT JOIN contacts c ON c.id = u.contact_id WHERE u.archived = 0
    UNION ALL
    SELECT 'repayment:' || COALESCE(json_extract(p.custom, '$.payment_group_id'), p.id), 'udhaar_payments',
      MIN(p.id), p.account_key, p.paid_date, SUM(p.amount), 'in', 'Udhaar repayment',
      COALESCE(c.name, u.borrower_name), COALESCE(p.notes, ''), COALESCE(p.method, 'Not recorded'), '', NULL
    FROM udhaar_payments p JOIN udhaars u ON u.id = p.udhaar_id LEFT JOIN contacts c ON c.id = u.contact_id
    WHERE p.archived = 0 AND u.archived = 0
    GROUP BY COALESCE(json_extract(p.custom, '$.payment_group_id'), p.id), p.account_key
    UNION ALL
    SELECT 'expense:' || id, 'personal_expenses', id, account_key, purchase_date, amount, 'out', 'Personal expense',
      '', item_name || CASE WHEN COALESCE(notes, '') = '' THEN '' ELSE ' · ' || notes END, 'Not recorded', '', NULL
    FROM personal_expenses WHERE archived = 0
    UNION ALL
    SELECT 'land:' || l.id, 'land', l.id, l.account_key, l.purchase_date, l.price, 'out', 'Land acquisition',
      COALESCE(json_extract(l.custom, '$.seller_name'), ''), l.title, 'Not recorded', COALESCE(pr.name, ''), l.project_id
    FROM land l LEFT JOIN projects pr ON pr.id = l.project_id WHERE l.archived = 0 AND l.price > 0
  ) ORDER BY date DESC, id`);
}

export async function assignBankAccount(entry: BankEntry, account: BankAccount): Promise<void> {
  const value = BankAccountSchema.parse(account);
  const allowed = ["transactions", "udhaars", "udhaar_payments", "personal_expenses", "land"];
  if (!allowed.includes(entry.source)) throw new Error("Unknown payment source");
  const where =
    entry.source === "udhaar_payments"
      ? `id = ? OR json_extract(custom, '$.payment_group_id') = (SELECT json_extract(custom, '$.payment_group_id') FROM udhaar_payments WHERE id = ?)`
      : "id = ?";
  const result = await execute(
    `UPDATE ${entry.source} SET account_key = ?, updated_at = ? WHERE archived = 0 AND (${where})`,
    [
      value,
      new Date().toISOString(),
      entry.source_id,
      ...(entry.source === "udhaar_payments" ? [entry.source_id] : []),
    ],
  );
  if (!result.rowsAffected)
    throw new Error("This payment is no longer available. Refresh the list.");
}
