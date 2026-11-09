import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type pg from "pg";
import type { FastifyInstance } from "fastify";
import { postFundingEntry } from "../server/src/funding";
import type { LandSheet } from "@baloch/shared";
export async function testLandPostgres(
  client: pg.PoolClient,
  app: FastifyInstance,
  headers: Record<string, string>,
  code: string,
  partnerId: string,
) {
  await client.query("SET CONSTRAINTS ALL DEFERRED");
  const project = (await client.query("SELECT id,details FROM projects WHERE code=$1", [code]))
    .rows[0];
  const seller = (
    await client.query(
      "INSERT INTO parties(name,type) VALUES('Land verification seller','seller') RETURNING id",
    )
  ).rows[0].id;
  const lender = (
    await client.query(
      "INSERT INTO parties(name,type) VALUES('Land verification lender','lender') RETURNING id",
    )
  ).rows[0].id;
  const parcelId = randomUUID();
  const contributedId = randomUUID();
  await client.query(
    "UPDATE projects SET details=jsonb_set(details,'{landParcels}',$2) WHERE id=$1",
    [
      project.id,
      JSON.stringify([
        { id: parcelId, name: "Purchase test", acquisitionType: "purchase", sellerPartyId: seller },
        {
          id: contributedId,
          name: "Contribution test",
          acquisitionType: "partner_contribution",
          contributingPartnerId: partnerId,
        },
      ]),
    ],
  );
  await client.query(
    "INSERT INTO project_partner_links(project_id,partner_id) VALUES($1,$2) ON CONFLICT DO NOTHING",
    [project.id, partnerId],
  );
  const funding = {
    date: "2026-01-01",
    amount: 30000000,
    account: "company_bank" as const,
    refNo: "Land verification",
    notes: "",
    sourceType: "partner" as const,
    partnerId,
    purpose: "Land" as const,
  };
  await postFundingEntry(client, project.id, { direction: "in", data: funding });
  await postFundingEntry(client, project.id, {
    direction: "in",
    data: { ...funding, account: "company_cash", amount: 5000000 },
  });
  const endpoint = `/api/projects/${code}/land`;
  async function request(
    path: string,
    payload: unknown,
    method: "POST" | "PUT" = "POST",
    expected = 200,
  ) {
    const r = await app.inject({
      method,
      url: endpoint + path,
      headers,
      payload: payload as object,
    });
    assert.equal(r.statusCode, expected, r.body);
    return r.json();
  }
  const sheet = async () => {
    const r = await app.inject({ url: endpoint, headers });
    assert.equal(r.statusCode, 200, r.body);
    return r.json<LandSheet>();
  };
  const p = await request("/purchase", {
    parcelId,
    sellerPartyId: seller,
    agreedPrice: 60000000,
    agreementDate: "2026-01-01",
  });
  const first = await request("/payments", {
    purchaseId: p.id,
    paidOn: "2026-01-01",
    sources: [{ sourceType: "bank", amount: 20000000 }],
  });
  const split = await request("/payments", {
    purchaseId: p.id,
    paidOn: "2026-01-01",
    sources: [
      { sourceType: "bank", amount: 6000000 },
      { sourceType: "partner_direct", partnerId, amount: 4000000 },
    ],
  });
  const lines = (
    await client.query(
      "SELECT account_code,debit,credit,partner_id FROM journal_lines WHERE voucher_id=$1",
      [split.voucherId],
    )
  ).rows;
  assert.equal(lines.length, 4);
  assert.equal(
    lines.reduce((sum, r) => sum + Number(r.debit) - Number(r.credit), 0),
    0,
  );
  assert.equal(
    Number(lines.find((r) => r.account_code === "3000" && r.partner_id === partnerId).credit),
    4000000,
  );
  await request("/payments", {
    purchaseId: p.id,
    paidOn: "2026-01-01",
    sources: [{ sourceType: "owner_direct", amount: 5000000 }],
  });
  let s = await sheet();
  assert.equal(s.totals.totalPaid, 35000000);
  assert.equal(s.totals.remaining, 25000000);
  const over = await request(
    "/payments",
    {
      purchaseId: p.id,
      paidOn: "2026-01-01",
      sources: [{ sourceType: "owner_direct", amount: 25000001 }],
    },
    "POST",
    409,
  );
  assert.match(over.error, /25,000,000/);
  const negative = await request(
    "/payments",
    {
      purchaseId: p.id,
      paidOn: "2026-01-01",
      sources: [{ sourceType: "bank", amount: s.available.bank + 1 }],
    },
    "POST",
    409,
  );
  assert.match(negative.error, /Available balance/);
  await request(
    "/payments",
    {
      purchaseId: p.id,
      paidOn: "2026-01-01",
      sources: [{ sourceType: "partner_direct", partnerId: randomUUID(), amount: 1 }],
    },
    "POST",
    400,
  );
  await request(`/purchase/${p.id}/void`, { reason: "blocked" }, "POST", 409);
  await request("/costs", {
    purchaseId: p.id,
    category: "registration",
    paidOn: "2026-01-01",
    source: { sourceType: "bank", amount: 3000000 },
  });
  await request("/costs", {
    purchaseId: p.id,
    category: "broker",
    paidOn: "2026-01-01",
    source: { sourceType: "cash", amount: 500000 },
  });
  await request("/contribution", {
    parcelId: contributedId,
    agreedValue: 10000000,
    contributedOn: "2026-01-01",
  });
  s = await sheet();
  assert.equal(s.totals.totalLandCost, 73500000);
  assert.equal(s.totals.remaining, 25000000);
  const balances = (
    await client.query(
      "SELECT l.account_code,sum(l.debit-l.credit) AS balance FROM journal_lines l JOIN journal_vouchers v ON v.id=l.voucher_id WHERE l.project_id=$1 AND v.status='posted' AND v.reversal_of IS NULL AND l.account_code IN ('1400','2010') GROUP BY l.account_code",
      [project.id],
    )
  ).rows;
  assert.equal(Number(balances.find((r) => r.account_code === "1400").balance), 73500000);
  assert.equal(Number(balances.find((r) => r.account_code === "2010").balance), -25000000);
  const fundingResponse = await app.inject({ url: `/api/projects/${code}/funding`, headers });
  assert.equal(fundingResponse.statusCode, 200, fundingResponse.body);
  const data = fundingResponse.json();
  const direct = data.entries.filter(
    (e: { data: { receivedInto?: string; partnerId?: string } }) =>
      e.data.receivedInto === "direct_payment" && e.data.partnerId === partnerId,
  );
  assert.equal(
    direct.reduce((sum: number, e: { data: { amount: number } }) => sum + e.data.amount, 0),
    14000000,
  );
  // Bank payments do not credit capital again; only direct and contributed land do.
  const capital = (
    await client.query(
      "SELECT coalesce(sum(l.credit),0) AS n FROM journal_lines l JOIN journal_vouchers v ON v.id=l.voucher_id WHERE l.project_id=$1 AND l.partner_id=$2 AND l.account_code='3000' AND v.status='posted' AND v.reversal_of IS NULL",
      [project.id, partnerId],
    )
  ).rows[0];
  assert.equal(Number(capital.n), 49000000);
  await request(`/payments/${split.id}/void`, { reason: "Test reversal" });
  assert.equal((await sheet()).totals.remaining, 35000000);
  const edited = await request(
    `/payments/${first.id}`,
    {
      purchaseId: p.id,
      paidOn: "2026-01-02",
      sources: [{ sourceType: "bank", amount: 15000000 }],
      expectedVoucherId: first.voucherId,
    },
    "PUT",
  );
  assert.notEqual(edited.voucherId, first.voucherId);
  assert.equal((await sheet()).totals.remaining, 40000000);
  const before = (await sheet()).totals.totalPaid;
  await request(
    `/payments/${edited.id}`,
    { purchaseId: p.id, paidOn: "2026-01-02", sources: [{ sourceType: "bank", amount: 60000000 }] },
    "PUT",
    409,
  );
  assert.equal(
    (await sheet()).totals.totalPaid,
    before,
    "Failed replacement must roll back the reversal",
  );
  const loan = await request("/payments", {
    purchaseId: p.id,
    paidOn: "2026-01-02",
    sources: [{ sourceType: "loan_direct", lenderPartyId: lender, amount: 1000000 }],
  });
  assert.equal(
    Number(
      (
        await client.query(
          "SELECT credit FROM journal_lines WHERE voucher_id=$1 AND account_code='2300' AND party_id=$2",
          [loan.voucherId, lender],
        )
      ).rows[0].credit,
    ),
    1000000,
  );
  const oldCost = (await sheet()).costs.find((c) => c.category === "broker")!;
  const changedCost = await request(
    `/costs/${oldCost.id}`,
    {
      purchaseId: p.id,
      category: "broker",
      paidOn: "2026-01-02",
      source: { sourceType: "cash", amount: 250000 },
    },
    "PUT",
  );
  assert.equal((await sheet()).totals.relatedCosts, 3250000);
  await request(`/costs/${changedCost.id}/void`, { reason: "Cost reversal" });
  assert.equal((await sheet()).totals.relatedCosts, 3000000);
  const negativeCash = await request(
    "/costs",
    { category: "other", paidOn: "2026-01-01", source: { sourceType: "cash", amount: 5000001 } },
    "POST",
    409,
  );
  assert.match(negativeCash.error, /cash.*Available/);
  const contribution = (await sheet()).contributions.find((c) => c.parcelId === contributedId)!;
  await request(`/contribution/${contribution.id}/void`, { reason: "Contribution reversal" });
  assert.equal((await sheet()).totals.agreedPrice, 60000000);
  const spare = randomUUID();
  await client.query(
    "UPDATE projects SET details=jsonb_set(details,'{landParcels}',details->'landParcels' || $2::jsonb) WHERE id=$1",
    [
      project.id,
      JSON.stringify([
        { id: spare, name: "Spare parcel", acquisitionType: "purchase", sellerPartyId: seller },
      ]),
    ],
  );
  const sparePurchase = await request("/purchase", {
    parcelId: spare,
    sellerPartyId: seller,
    agreedPrice: 1000,
    agreementDate: "2026-01-01",
  });
  const editedPurchase = await request(
    `/purchase/${sparePurchase.id}`,
    { parcelId: spare, sellerPartyId: seller, agreedPrice: 2000, agreementDate: "2026-01-01" },
    "PUT",
  );
  await request(`/purchase/${editedPurchase.id}/void`, { reason: "Unused agreement" });
  const admin = (await client.query("SELECT current_setting('app.actor_id') AS id")).rows[0].id;
  await client.query("UPDATE users SET role='accountant' WHERE id=$1", [admin]);
  await sheet();
  await request(
    "/purchase",
    { parcelId: spare, sellerPartyId: seller, agreedPrice: 1000, agreementDate: "2026-01-01" },
    "POST",
    403,
  );
  await client.query("UPDATE users SET role='admin' WHERE id=$1", [admin]);
  await client.query("SET CONSTRAINTS ALL IMMEDIATE");
  await client.query("SET CONSTRAINTS ALL DEFERRED");
  await client.query("SAVEPOINT wrong_split");
  await client.query(
    "INSERT INTO land_payment_sources(payment_id,source_type,amount) VALUES($1,'bank',1)",
    [loan.id],
  );
  await assert.rejects(client.query("SET CONSTRAINTS ALL IMMEDIATE"), { code: "23514" });
  await client.query("ROLLBACK TO SAVEPOINT wrong_split");
  assert.ok(
    Number(
      (await client.query("SELECT count(*) FROM audit_log WHERE entity='land'")).rows[0].count,
    ) > 0,
  );
  console.log(
    "PostgreSQL land checks passed: split postings, balances, direct capital, loan, contribution, edits, reversals, permissions and deferred totals.",
  );
}
