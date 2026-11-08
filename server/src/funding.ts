import type pg from "pg";
import { randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import {
  fundingLines,
  moneyIn,
  moneyOut,
  partnerProfile,
  partySchema,
  type Funding,
  type Payout,
} from "@baloch/shared";
import { pool, transaction } from "./db";
import { accountingError as fail, postVoucher, voidVoucher } from "./journal";
const read = { config: { permission: "ledger" as const } };
const write = { config: { permission: "manageProjects" as const } };
const accountsRead = { config: { permission: "accounts" as const } };
const id = z.string().uuid();
const file = z.object({
  name: z.string().trim().min(1).max(255),
  content: z.string().base64().min(4).max(7_000_000),
});
const actor = (request: FastifyRequest) => request.actor!.id;
const projectCode = (request: FastifyRequest) =>
  z.object({ id: z.string().regex(/^P-\d+$/) }).parse(request.params).id;
const masterColumns =
  'id,name,role,status,profile,created_at AS "createdAt",updated_at AS "updatedAt"';
const master = (row: Record<string, unknown>) => {
  const { profile, ...base } = row;
  return {
    phone: "",
    email: "",
    address: "",
    idNumber: "",
    bankDetails: "",
    joinedDate: "",
    notes: "",
    ...(profile as object),
    ...base,
  };
};
const journalSelect = `SELECT l.id,v.id AS "voucherId",v.date::text,v.narration,l.account_code AS "accountCode",a.name AS "accountName",
 l.debit,l.credit,p.name AS party,m.name AS partner,l.partner_id AS "partnerId",v.status,v.type,v.reversal_of AS "reversalOf",
 j.code AS "projectCode",j.name AS "projectName"
 FROM journal_lines l JOIN journal_vouchers v ON v.id=l.voucher_id JOIN accounts a ON a.code=l.account_code
 LEFT JOIN parties p ON p.id=l.party_id LEFT JOIN partners m ON m.id=l.partner_id LEFT JOIN projects j ON j.id=l.project_id`;
const journal = (rows: Record<string, unknown>[]) =>
  rows.map((row) => ({ ...row, debit: Number(row.debit), credit: Number(row.credit) }));
const active = `v.status='posted' AND v.reversal_of IS NULL`;
const entriesColumns =
  'id,direction,data,voucher_id AS "voucherId",status,attachment_id AS "attachmentId"';
const input = z.discriminatedUnion("direction", [
  z.object({
    direction: z.literal("in"),
    data: moneyIn,
    attachment: file.optional(),
    replaceId: id.optional(),
  }),
  z.object({ direction: z.literal("out"), data: moneyOut, replaceId: id.optional() }),
]);

export async function postFundingEntry(
  client: pg.PoolClient,
  projectId: string,
  payload: z.infer<typeof input>,
  recordId = randomUUID(),
) {
  const previous = payload.replaceId
    ? (
        await client.query(
          "SELECT * FROM project_money_entries WHERE id=$1 AND project_id=$2 FOR UPDATE",
          [payload.replaceId, projectId],
        )
      ).rows[0]
    : null;
  if (
    payload.replaceId &&
    (!previous ||
      previous.status !== "posted" ||
      previous.direction !== payload.direction ||
      previous.data.receivedInto === "direct_payment")
  )
    throw fail("This entry cannot be edited.", 409);
  let partyId: string | undefined;
  let sourceName: string;
  const data: (Funding | Payout) & { loanKey?: string } = { ...payload.data };
  if ("sourceType" in data && data.sourceType === "loan") {
    const lender = (
      await client.query("SELECT id,name FROM parties WHERE id=$1 AND type='lender'", [
        data.lenderPartyId ?? null,
      ])
    ).rows[0];
    if (!lender || !data.loanTerms) throw fail("Select a lender and loan type.");
    partyId = lender.id;
    sourceName = lender.name;
    delete data.partnerId;
    data.loanKey =
      previous?.data.sourceType === "loan" ? (previous.data.loanKey ?? previous.id) : recordId;
  } else if ("kind" in data && data.kind.startsWith("loan_")) {
    const loan = (
      await client.query(
        `SELECT e.id,e.data,p.name FROM project_money_entries e JOIN parties p ON p.id=(e.data->>'lenderPartyId')::uuid
     WHERE e.project_id=$1 AND e.status='posted' AND e.data->>'sourceType'='loan' AND COALESCE(e.data->>'loanKey',e.id::text)=$2`,
        [projectId, data.loanFundingId ?? ""],
      )
    ).rows[0];
    if (!loan) throw fail("Select an active loan for this project.");
    partyId = loan.data.lenderPartyId;
    sourceName = loan.name;
    delete data.partnerId;
  } else {
    const partner =
      "sourceType" in data && data.sourceType === "owner"
        ? (await client.query("SELECT id,name FROM partners WHERE role='Owner'")).rows[0]
        : (await client.query("SELECT id,name FROM partners WHERE id=$1", [data.partnerId ?? null]))
            .rows[0];
    if (!partner) throw fail("Select a partner.");
    data.partnerId = partner.id;
    sourceName = partner.name;
  }
  if (previous) {
    await voidVoucher(client, previous.voucher_id, "Entry edited");
    await client.query("UPDATE project_money_entries SET status='void' WHERE id=$1", [previous.id]);
  }
  const label =
    "sourceType" in data
      ? `Money in: ${sourceName} (${data.purpose.toLowerCase()})`
      : `${{ capital_return: "Capital returned", profit_distribution: "Profit distributed", loan_principal: "Loan principal repaid", loan_markup: "Loan markup paid" }[data.kind]}: ${sourceName}`;
  const voucherId = await postVoucher(client, {
    date: data.date,
    projectId: projectId,
    narration: label,
    source: { module: "project_funding", refId: recordId },
    lines: fundingLines(payload.direction, data, projectId, partyId),
  });
  let attachmentId = previous?.attachment_id ?? null;
  if ("attachment" in payload && payload.attachment)
    attachmentId = (
      await client.query(
        "INSERT INTO project_files(project_id,name,content) VALUES($1,$2,$3) RETURNING id",
        [projectId, payload.attachment.name, payload.attachment.content],
      )
    ).rows[0].id;
  return (
    await client.query(
      `INSERT INTO project_money_entries(id,project_id,direction,data,voucher_id,attachment_id) VALUES($1,$2,$3,$4,$5,$6) RETURNING ${entriesColumns}`,
      [recordId, projectId, payload.direction, JSON.stringify(data), voucherId, attachmentId],
    )
  ).rows[0];
}

export function registerFunding(app: FastifyInstance) {
  app.get("/api/accounts", accountsRead, async () =>
    (
      await pool.query(`SELECT a.code,a.name,a.class,a.is_system AS "isSystem",a.is_active AS "isActive",
 COALESCE(SUM(l.debit-l.credit) FILTER (WHERE ${active}),0) AS balance
 FROM accounts a LEFT JOIN journal_lines l ON a.code=l.account_code LEFT JOIN journal_vouchers v ON v.id=l.voucher_id
 GROUP BY a.code ORDER BY a.code`)
    ).rows.map((r) => ({ ...r, balance: Number(r.balance) })),
  );
  app.get("/api/partners", read, async () =>
    (await pool.query(`SELECT ${masterColumns} FROM partners ORDER BY role DESC,name`)).rows.map(
      master,
    ),
  );
  app.post("/api/partners", write, async (request) => {
    const { name, role, status, ...profile } = partnerProfile.parse(request.body);
    if (role === "Owner") throw fail("Edit the existing Owner record.");
    const row = (
      await pool.query(
        `INSERT INTO partners(name,role,status,profile) VALUES($1,$2,$3,$4) RETURNING ${masterColumns}`,
        [name, role, status, JSON.stringify(profile)],
      )
    ).rows[0];
    return master(row);
  });
  app.put("/api/partners/:partnerId", write, async (request) => {
    const { partnerId } = z.object({ partnerId: id }).parse(request.params);
    const { name, status, ...profile } = partnerProfile.parse(request.body);
    const row = (
      await pool.query(
        `UPDATE partners SET name=$2,status=CASE WHEN role='Owner' THEN 'Active' ELSE $3 END,profile=$4,updated_at=now()
  WHERE id=$1 RETURNING ${masterColumns}`,
        [partnerId, name, status, JSON.stringify(profile)],
      )
    ).rows[0];
    if (!row) throw fail("Partner not found.", 404);
    return master(row);
  });
  app.get("/api/partners/:partnerId", read, async (request) => {
    const { partnerId } = z.object({ partnerId: id }).parse(request.params);
    const row = (await pool.query(`SELECT ${masterColumns} FROM partners WHERE id=$1`, [partnerId]))
      .rows[0];
    if (!row) throw fail("Partner not found.", 404);
    const [lines, docs] = await Promise.all([
      pool.query(journalSelect + ` WHERE l.partner_id=$1 AND ${active} ORDER BY v.date,v.id,l.id`, [
        partnerId,
      ]),
      pool.query("SELECT id,name FROM partner_documents WHERE partner_id=$1 ORDER BY name", [
        partnerId,
      ]),
    ]);
    return { partner: master(row), lines: journal(lines.rows), documents: docs.rows };
  });
  app.post("/api/partners/:partnerId/documents", write, async (request) => {
    const { partnerId } = z.object({ partnerId: id }).parse(request.params);
    const document = file.parse(request.body);
    return (
      await pool.query(
        "INSERT INTO partner_documents(partner_id,name,content) VALUES($1,$2,$3) RETURNING id,name",
        [partnerId, document.name, document.content],
      )
    ).rows[0];
  });
  app.get("/api/partners/:partnerId/documents/:fileId", read, async (request) => {
    const params = z.object({ partnerId: id, fileId: id }).parse(request.params);
    const row = (
      await pool.query("SELECT name,content FROM partner_documents WHERE partner_id=$1 AND id=$2", [
        params.partnerId,
        params.fileId,
      ])
    ).rows[0];
    if (!row) throw fail("Document not found.", 404);
    return row;
  });
  app.get("/api/projects/:id/funding", read, async (request) => {
    const code = projectCode(request);
    const row = (
      await pool.query("SELECT id,details->'feasibility' AS plan FROM projects WHERE code=$1", [
        code,
      ])
    ).rows[0];
    if (!row) throw fail("Project not found.", 404);
    const [lines, entries, links, lenders, partners] = await Promise.all([
      pool.query(journalSelect + " WHERE l.project_id=$1 ORDER BY v.date,v.created_at,v.id,l.id", [
        row.id,
      ]),
      pool.query(
        `SELECT ${entriesColumns} FROM project_money_entries WHERE project_id=$1 ORDER BY created_at DESC`,
        [row.id],
      ),
      pool.query(
        'SELECT partner_id AS "partnerId" FROM project_partner_links WHERE project_id=$1',
        [row.id],
      ),
      pool.query("SELECT id,name FROM parties WHERE type='lender' ORDER BY name"),
      pool.query("SELECT id,name,role,status FROM partners ORDER BY name"),
    ]);
    return {
      lines: journal(lines.rows),
      entries: entries.rows,
      links: links.rows.map((l) => l.partnerId),
      lenders: lenders.rows,
      partners: partners.rows,
      plan: row.plan,
    };
  });
  app.post("/api/projects/:id/funding/lenders", write, async (request) => {
    const party = partySchema.parse({ ...(request.body as object), type: "lender" });
    return (
      await pool.query(
        "INSERT INTO parties(name,type,phone,address,notes) VALUES($1,$2,$3,$4,$5) RETURNING id,name",
        [party.name, party.type, party.phone, party.address, party.notes],
      )
    ).rows[0];
  });
  app.post("/api/projects/:id/funding/partners", write, async (request) => {
    const { partnerId } = z.object({ partnerId: id }).parse(request.body);
    if (!(await pool.query("SELECT id FROM partners WHERE id=$1", [partnerId])).rowCount)
      throw fail("Select a valid partner.");
    await pool.query(
      "INSERT INTO project_partner_links(project_id,partner_id) SELECT id,$2 FROM projects WHERE code=$1 ON CONFLICT DO NOTHING",
      [projectCode(request), partnerId],
    );
    return { ok: true };
  });
  app.post("/api/projects/:id/funding", write, async (request) => {
    const payload = input.parse(request.body);
    return transaction(actor(request), async (client) => {
      const project = (
        await client.query("SELECT id FROM projects WHERE code=$1 FOR UPDATE", [
          projectCode(request),
        ])
      ).rows[0];
      if (!project) throw fail("Project not found.", 404);
      return postFundingEntry(client, project.id, payload);
    });
  });
  app.post("/api/projects/:id/funding/:entryId/void", write, async (request) => {
    const { entryId } = z.object({ entryId: id }).parse(request.params);
    const { reason } = z.object({ reason: z.string().trim().min(1).max(250) }).parse(request.body);
    return transaction(actor(request), async (client) => {
      const entry = (
        await client.query(
          "SELECT e.* FROM project_money_entries e JOIN projects p ON p.id=e.project_id WHERE p.code=$1 AND e.id=$2 FOR UPDATE OF e",
          [projectCode(request), entryId],
        )
      ).rows[0];
      if (!entry || entry.status !== "posted" || entry.data.receivedInto === "direct_payment")
        throw fail("This entry cannot be voided.", 409);
      await voidVoucher(client, entry.voucher_id, reason);
      await client.query("UPDATE project_money_entries SET status='void' WHERE id=$1", [entryId]);
      return { ok: true };
    });
  });
}
