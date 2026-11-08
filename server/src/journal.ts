import type pg from "pg";
import { reverseLines, validatePosting, type PostingLine } from "@baloch/shared";
export const accountingError = (message: string, statusCode = 400) =>
  Object.assign(new Error(message), { statusCode });
export type VoucherInput = {
  date: string;
  projectId?: string;
  narration: string;
  type?: "regular" | "adjustment";
  source: { module: string; refId: string };
  lines: PostingLine[];
};
async function writeVoucher(client: pg.PoolClient, input: VoucherInput, reversalOf?: string) {
  try {
    validatePosting(input.lines);
  } catch (error) {
    throw accountingError(String(error));
  }
  const codes = [...new Set(input.lines.map((l) => l.accountCode))];
  const { rows } = await client.query(
    "SELECT code FROM accounts WHERE code=ANY($1) AND (is_active OR $2)",
    [codes, !!reversalOf],
  );
  if (rows.length !== codes.length)
    throw accountingError("Every account must exist and be active.");
  const voucher = (
    await client.query(
      `INSERT INTO journal_vouchers(id,date,project_id,narration,type,source,reversal_of)
 SELECT 'JV-' || repeat('0',greatest(0,4-length(n))) || n,$1,$2,$3,$4,$5,$6
 FROM (SELECT nextval('journal_voucher_number')::text AS n) seq RETURNING id`,
      [
        input.date,
        input.projectId ?? null,
        input.narration,
        reversalOf ? "reversal" : (input.type ?? "regular"),
        JSON.stringify(input.source),
        reversalOf ?? null,
      ],
    )
  ).rows[0];
  for (const line of input.lines)
    await client.query(
      "INSERT INTO journal_lines(voucher_id,account_code,debit,credit,party_id,partner_id,project_id,memo) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
      [
        voucher.id,
        line.accountCode,
        line.debit,
        line.credit,
        line.partyId ?? null,
        line.partnerId ?? null,
        line.projectId ?? input.projectId ?? null,
        line.memo ?? "",
      ],
    );
  return voucher.id as string;
}
export const postVoucher = (client: pg.PoolClient, input: VoucherInput) =>
  writeVoucher(client, input);
export async function voidVoucher(client: pg.PoolClient, id: string, reason: string) {
  const voucher = (
    await client.query(
      "SELECT id,date::text,project_id,narration,source,status,reversal_of FROM journal_vouchers WHERE id=$1 FOR UPDATE",
      [id],
    )
  ).rows[0];
  if (!voucher || voucher.status === "void" || voucher.reversal_of)
    throw accountingError("This voucher cannot be voided.", 409);
  const { rows } = await client.query(
    'SELECT account_code AS "accountCode",debit,credit,party_id AS "partyId",partner_id AS "partnerId",project_id AS "projectId",memo FROM journal_lines WHERE voucher_id=$1',
    [id],
  );
  const lines = reverseLines(
    rows.map((row) => ({ ...row, debit: Number(row.debit), credit: Number(row.credit) })),
  );
  await client.query("UPDATE journal_vouchers SET status='void',voided_at=now() WHERE id=$1", [id]);
  return writeVoucher(
    client,
    {
      date: voucher.date,
      projectId: voucher.project_id,
      narration: `Reversal: ${voucher.narration} (${reason})`,
      source: voucher.source,
      lines,
    },
    id,
  );
}
