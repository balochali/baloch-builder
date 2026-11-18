import assert from "node:assert/strict";
import type pg from "pg";
import type { FastifyInstance } from "fastify";
import { randomUUID, createHash } from "node:crypto";
import { readSales } from "../server/src/sales";
export async function testSalesPostgres(
  c: pg.PoolClient,
  app: FastifyInstance,
  headers: Record<string, string>,
  code: string,
) {
  await c.query("SET CONSTRAINTS ALL DEFERRED");
  const project = (await c.query("SELECT id FROM projects WHERE code=$1", [code])).rows[0].id;
  const base = `/api/projects/${code}/sales`;
  async function request(
    path: string,
    payload: object,
    expected = 200,
    method: "POST" | "PUT" = "POST",
  ) {
    const r = await app.inject({ method, url: base + path, headers, payload });
    assert.equal(r.statusCode, expected, r.body);
    if (expected === 200) {
      await c.query("SET CONSTRAINTS ALL IMMEDIATE");
      await c.query("SET CONSTRAINTS ALL DEFERRED");
    }
    return r.json();
  }
  const customer = (
    await c.query(
      "INSERT INTO parties(name,type) VALUES('Sales recovery customer','client') RETURNING id",
    )
  ).rows[0].id;
  const unit = await request("/units", {
    unit_no: "TEST-A-101",
    category: "Flat",
    list_price: 1000,
  });
  const plan = {
    unit_id: unit.id,
    customer_party_id: customer,
    agreement_date: "2026-01-01",
    total_price: 1000,
    plan_type: "full",
    schedule: [{ seq: 1, label: "Full payment", due_date: "2026-01-01", amount: 1000 }],
  };
  await request("/agreements", { ...plan, schedule: [{ ...plan.schedule[0], amount: 999 }] }, 400);
  const a = await request("/agreements", plan);
  await request("/agreements", plan, 409);
  const payment = {
    agreement_id: a.id,
    received_on: "2026-01-02",
    amount: 300,
    method: "bank_transfer",
    deposited_to: "bank",
  };
  const p = await request("/payments", payment);
  const posting = async (id: string) =>
    (
      await c.query(
        "SELECT account_code,debit::text,credit::text FROM journal_lines WHERE voucher_id=$1 ORDER BY account_code",
        [id],
      )
    ).rows;
  assert.deepEqual(await posting(p.voucher_id), [
    { account_code: "1010", debit: "300", credit: "0" },
    { account_code: "2200", debit: "0", credit: "300" },
  ]);
  await request("/payments", { ...payment, amount: 701 }, 409);
  const get = async () => (await readSales(c, project)).agreements.find((x) => x.id === a.id)!;
  await request(`/agreements/${a.id}/handover`, {
    date: "2026-01-03",
    version: (await get()).version,
  });
  const handed = await get();
  assert.deepEqual(await posting(handed.handover_voucher_id!), [
    { account_code: "1100", debit: "700", credit: "0" },
    { account_code: "2200", debit: "300", credit: "0" },
    { account_code: "4000", debit: "0", credit: "1000" },
  ]);
  const after = await request("/payments", { ...payment, received_on: "2026-01-04", amount: 200 });
  assert.deepEqual(await posting(after.voucher_id), [
    { account_code: "1010", debit: "200", credit: "0" },
    { account_code: "1100", debit: "0", credit: "200" },
  ]);
  await request(
    `/agreements/${a.id}/handover/void`,
    { date: "2026-01-04", version: (await get()).version },
    409,
  );
  await request(
    `/agreements/${a.id}/cancel`,
    {
      cancelled_on: "2026-01-04",
      reason: "Test",
      refund_amount: 500,
      forfeited_amount: 0,
      refund_paid_from: "bank",
      version: (await get()).version,
    },
    409,
  );
  await request(`/payments/${after.id}/void`, {
    reason: "Correction",
    expectedVoucherId: after.voucher_id,
  });
  assert.equal((await get()).received, 300);
  await request(`/agreements/${a.id}/handover/void`, {
    date: "2026-01-04",
    version: (await get()).version,
  });
  await request(`/payments/${p.id}/void`, {
    reason: "Correction",
    expectedVoucherId: p.voucher_id,
  });
  assert.equal((await get()).received, 0);
  const replacement = await request("/payments", { ...payment, amount: 500 });
  await request(`/agreements/${a.id}/cancel`, {
    cancelled_on: "2026-01-05",
    reason: "Buyer cancelled",
    refund_amount: 400,
    forfeited_amount: 100,
    refund_paid_from: "bank",
    version: (await get()).version,
  });
  const cancellation = (
    await c.query("SELECT refund_voucher_id FROM sale_cancellations WHERE agreement_id=$1", [a.id])
  ).rows[0];
  assert.deepEqual(await posting(cancellation.refund_voucher_id), [
    { account_code: "1010", debit: "0", credit: "400" },
    { account_code: "2200", debit: "500", credit: "0" },
    { account_code: "4100", debit: "0", credit: "100" },
  ]);
  assert.equal(
    (await c.query("SELECT status FROM sale_payments WHERE id=$1", [replacement.id])).rows[0]
      .status,
    "posted",
  );
  assert.equal((await readSales(c, project)).totals.available, 1);
  await request(
    `/payments/${replacement.id}/void`,
    { reason: "Not allowed", expectedVoucherId: replacement.voucher_id },
    409,
  );
  await request("/agreements", plan);
  // Database-level schedule invariant, independent of service validation.
  await c.query("SAVEPOINT sales_invalid");
  const uid = randomUUID();
  await c.query(
    "INSERT INTO sale_units(id,project_id,unit_no,category) VALUES($1,$2,'INVALID','Flat')",
    [uid, project],
  );
  await c.query(
    "INSERT INTO sale_agreements(project_id,unit_id,customer_party_id,agreement_date,total_price,plan_type) VALUES($1,$2,$3,'2026-01-01',100,'full')",
    [project, uid, customer],
  );
  await assert.rejects(c.query("SET CONSTRAINTS ALL IMMEDIATE"), /Payment plan total/);
  await c.query("ROLLBACK TO SAVEPOINT sales_invalid");
  for (const table of [
    "sale_units",
    "sale_agreements",
    "sale_installments",
    "sale_payments",
    "sale_cancellations",
  ]) {
    const row = (
      await c.query(
        "SELECT has_table_privilege('baloch_app',$1,'UPDATE') AS update,has_table_privilege('baloch_app',$1,'DELETE') AS delete",
        [table],
      )
    ).rows[0];
    assert.equal(row.update, false);
    assert.equal(row.delete, false);
  }
  const token = randomUUID();
  const user = (
    await c.query(
      "INSERT INTO users(email,username,password_hash,role,created_by) SELECT $1,$2,'unused','construction',id FROM users WHERE role='admin' LIMIT 1 RETURNING id",
      [token + "@test.local", "test_" + token.replace(/-/g, "")],
    )
  ).rows[0].id;
  await c.query(
    "INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '1 hour')",
    [createHash("sha256").update(token).digest("hex"), user],
  );
  const limited = { ...headers, cookie: "session=" + token };
  assert.equal((await app.inject({ method: "GET", url: base, headers: limited })).statusCode, 403);
  assert.equal(
    (
      await app.inject({
        method: "POST",
        url: base + "/payments",
        headers: limited,
        payload: payment,
      })
    ).statusCode,
    403,
  );
  const search = await app.inject({ method: "GET", url: "/api/search?q=TEST-A", headers });
  assert.equal(search.statusCode, 200);
  assert.ok(search.json().some((x: { kind: string }) => x.kind === "unit"));
  const hidden = await app.inject({ method: "GET", url: "/api/search?q=TEST-A", headers: limited });
  assert.ok(hidden.json().every((x: { kind: string }) => x.kind === "project"));

  // Exercise corrections, optimistic versions, zero-paid handover and allocated payments.
  const unit2 = await request("/units", {
    unit_no: "TEST-B-201",
    category: "Flat",
    list_price: 1000,
  });
  const newPlan = {
    ...plan,
    unit_id: unit2.id,
    schedule: [
      { seq: 1, label: "First", due_date: "2026-01-01", amount: 500 },
      { seq: 2, label: "Second", due_date: "2026-02-01", amount: 500 },
    ],
  };
  const second = await request("/agreements", newPlan);
  const current = async () =>
    (await readSales(c, project)).agreements.find((x) => x.id === second.id)!;
  await request(
    `/agreements/${second.id}/handover`,
    { date: "2026-01-01", version: (await current()).version },
    400,
  );
  const target = (await current()).schedule[1].id;
  const allocated = await request("/payments", {
    ...payment,
    agreement_id: second.id,
    installment_id: target,
    amount: 200,
  });
  const initialVersion = (await current()).version;
  const changed = await request(
    `/payments/${allocated.id}`,
    { ...payment, agreement_id: second.id, amount: 250, expectedVoucherId: allocated.voucher_id },
    200,
    "PUT",
  );
  assert.notEqual(changed.voucher_id, allocated.voucher_id);
  assert.equal(
    (await c.query("SELECT status FROM sale_payments WHERE id=$1", [allocated.id])).rows[0].status,
    "void",
  );
  assert.equal((await current()).received, 250);
  await request(`/agreements/${second.id}`, { ...newPlan, version: initialVersion }, 409, "PUT");
  const fresh = await current();
  await request(
    `/agreements/${second.id}`,
    {
      ...newPlan,
      total_price: 200,
      schedule: [
        { ...fresh.schedule[0], amount: 100 },
        { ...fresh.schedule[1], amount: 100 },
      ],
      version: fresh.version,
    },
    409,
    "PUT",
  );
  await request(
    `/units/${unit2.id}`,
    { unit_no: "changed", category: "Flat", version: 1 },
    409,
    "PUT",
  );
  await request(
    "/payments",
    { ...payment, agreement_id: second.id, received_on: "2099-01-01" },
    400,
  );
  await request(
    `/agreements/${second.id}/cancel`,
    {
      cancelled_on: "2026-01-03",
      reason: "Mismatch",
      refund_amount: 1,
      forfeited_amount: 0,
      refund_paid_from: "bank",
      version: (await current()).version,
    },
    400,
  );
  const thirdUnit = await request("/units", { unit_no: "TEST-ZERO", category: "Shop" });
  const third = await request("/agreements", { ...plan, unit_id: thirdUnit.id });
  const zero = (await readSales(c, project)).agreements.find((x) => x.id === third.id)!;
  await request(`/agreements/${third.id}/handover`, {
    date: "2026-01-01",
    version: zero.version,
    confirmZero: true,
  });
  const zeroHandover = (await readSales(c, project)).agreements.find((x) => x.id === third.id)!;
  assert.deepEqual(await posting(zeroHandover.handover_voucher_id!), [
    { account_code: "1100", debit: "1000", credit: "0" },
    { account_code: "4000", debit: "0", credit: "1000" },
  ]);
  console.log(
    "Sales PostgreSQL checks passed: payments, revenue, reversals, cancellation, schedule constraints, privileges and search.",
  );
}
