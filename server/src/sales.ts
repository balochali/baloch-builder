import type pg from "pg";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  saleAgreementSchema,
  saleUnitSchema,
  salePaymentSchema,
  saleCancelSchema,
  salesPosting,
  salesTotals,
  saleUnitNumbers,
  type SaleAgreement,
  type SaleUnit,
  type SalePayment,
  type SiteBuilding,
} from "@baloch/shared";
import { audit } from "./db";
import { accountingError as fail, postVoucher, voidVoucher } from "./journal";
import { landAvailable } from "./land";
export async function lockSales(c: pg.PoolClient, projectId: string) {
  const p = (await c.query("SELECT id,details FROM projects WHERE id=$1 FOR UPDATE", [projectId]))
    .rows[0];
  if (!p) throw fail("Project not found.", 404);
  return p;
}
async function record(c: pg.PoolClient, action: string, id: string) {
  const actor = (await c.query("SELECT nullif(current_setting('app.actor_id',true),'') AS id"))
    .rows[0].id;
  await audit(actor, action, "sales", id, null, c);
}
export async function readSales(c: Pick<pg.PoolClient, "query">, projectId: string) {
  const units = (
    await c.query("SELECT * FROM sale_units WHERE project_id=$1 ORDER BY unit_no", [projectId])
  ).rows.map((r) => ({
    ...r,
    size_sqft: Number(r.size_sqft),
    list_price: Number(r.list_price),
  })) as SaleUnit[];
  const agreements = (
    await c.query(
      `SELECT a.*,a.agreement_date::text,a.handover_date::text,p.name AS customer_name FROM sale_agreements a JOIN parties p ON p.id=a.customer_party_id WHERE a.project_id=$1 ORDER BY a.created_at`,
      [projectId],
    )
  ).rows;
  const schedule = (
    await c.query(
      "SELECT s.*,s.due_date::text FROM sale_installments s JOIN sale_agreements a ON a.id=s.agreement_id WHERE a.project_id=$1 ORDER BY s.seq",
      [projectId],
    )
  ).rows;
  const payments = (
    await c.query(
      `SELECT p.*,p.received_on::text,coalesce((SELECT sum(l.debit) FROM journal_lines l JOIN journal_vouchers v ON v.id=l.voucher_id WHERE v.id=p.voucher_id AND v.status='posted' AND v.reversal_of IS NULL AND l.account_code IN ('1000','1010')),0) AS journal_amount FROM sale_payments p JOIN sale_agreements a ON a.id=p.agreement_id WHERE a.project_id=$1 ORDER BY p.created_at`,
      [projectId],
    )
  ).rows;
  const rows = agreements.map((a) => ({
    ...a,
    total_price: Number(a.total_price),
    discount: Number(a.discount),
    schedule: schedule
      .filter((s) => s.agreement_id === a.id)
      .map((s) => ({ ...s, amount: Number(s.amount) })),
    allocations: payments
      .filter((p) => p.agreement_id === a.id && p.status === "posted" && p.installment_id)
      .map((p) => ({ installmentId: p.installment_id, amount: Number(p.journal_amount) })),
    received: payments
      .filter((p) => p.agreement_id === a.id && p.status === "posted")
      .reduce((s, p) => s + Number(p.journal_amount), 0),
  })) as SaleAgreement[];
  const customers = (
    await c.query(
      "SELECT id,name,phone,address,cnic,second_contact FROM parties WHERE type='client' ORDER BY name",
    )
  ).rows;
  const details = (await c.query("SELECT details FROM projects WHERE id=$1", [projectId])).rows[0]
    ?.details;
  const expectedSales = { min: 0, max: 0 };
  for (const row of details?.feasibility?.salesRows ?? []) {
    expectedSales.min +=
      ((row.minRatePerSqft ?? row.maxRatePerSqft ?? 0) *
        row.areaSqft *
        row.count *
        (row.soldPercent ?? 100)) /
      100;
    expectedSales.max +=
      ((row.maxRatePerSqft ?? row.minRatePerSqft ?? 0) *
        row.areaSqft *
        row.count *
        (row.soldPercent ?? 100)) /
      100;
  }
  return {
    expectedSales,
    units,
    agreements: rows,
    payments: payments.map((p) => ({ ...p, amount: Number(p.amount) })) as SalePayment[],
    customers,
    building: details?.building ?? { units: [] },
    totals: salesTotals(units, rows),
  };
}
async function agreement(c: pg.PoolClient, projectId: string, id: string) {
  const a = (await readSales(c, projectId)).agreements.find((a) => a.id === id);
  if (!a || a.status !== "active")
    throw fail("This sale is cancelled or no longer available. Refresh and try again.", 409);
  return { ...a, project_id: projectId };
}
export async function saveSaleUnit(
  c: pg.PoolClient,
  projectId: string,
  input: unknown,
  id?: string,
) {
  await lockSales(c, projectId);
  const d = saleUnitSchema.parse(input);
  if (id) {
    if (!d.version) throw fail("Refresh this unit before saving.", 409);
    const u = (
      await c.query("SELECT id FROM sale_units WHERE id=$1 AND project_id=$2", [id, projectId])
    ).rows[0];
    if (!u) throw fail("Unit not found.", 404);
    await c.query("SELECT edit_sale_unit($1,$2,$3)", [id, d.version, JSON.stringify(d)]);
  } else {
    id = randomUUID();
    await c.query(
      "INSERT INTO sale_units(id,project_id,unit_no,category,floor_label,size_sqft,bedrooms,bathrooms,facing,list_price,notes,is_active) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)",
      [
        id,
        projectId,
        d.unit_no,
        d.category,
        d.floor_label,
        d.size_sqft,
        d.bedrooms,
        d.bathrooms,
        d.facing,
        d.list_price,
        d.notes,
        d.is_active,
      ],
    );
  }
  await record(c, "unit.saved", id);
  return { id };
}
export async function generateSaleUnits(c: pg.PoolClient, projectId: string, input: unknown) {
  const data = z
    .object({
      prefix: z.string().trim().max(20).default(""),
      start: z.number().int().positive().default(1),
    })
    .parse(input);
  const p = await lockSales(c, projectId);
  const building = p.details?.building as SiteBuilding | undefined;
  if (!building?.units.some((u) => u.count > 0))
    throw fail("Add unit types and quantities in Building before generating sellable units.");
  let created = 0;
  for (const { type, sourceSerial: n, floor, number: no } of saleUnitNumbers(
    building,
    data.prefix,
    data.start,
  )) {
    if (
      (
        await c.query(
          "SELECT 1 FROM sale_units WHERE project_id=$1 AND source_unit_type_id=$2 AND source_serial=$3",
          [projectId, type.id, n],
        )
      ).rowCount
    )
      continue;
    await c.query(
      "INSERT INTO sale_units(project_id,unit_no,category,floor_label,source_unit_type_id,source_serial,source_snapshot,size_sqft,bedrooms,bathrooms) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
      [
        projectId,
        no,
        type.category,
        floor,
        type.id,
        n,
        JSON.stringify(type),
        type.sizeSqft,
        type.bedrooms,
        type.bathrooms,
      ],
    );
    created++;
  }
  await record(c, "units.generated", projectId);
  return { created };
}
export async function saveSaleAgreement(
  c: pg.PoolClient,
  projectId: string,
  input: unknown,
  id?: string,
) {
  await lockSales(c, projectId);
  const d = saleAgreementSchema.parse(input);
  if (
    !new Set(d.schedule.map((s) => s.seq)).size ||
    new Set(d.schedule.map((s) => s.seq)).size !== d.schedule.length
  )
    throw fail("Each payment plan row needs a unique sequence.");
  if (id) {
    const a = await agreement(c, projectId, id);
    if (d.unit_id !== a.unit_id || d.customer_party_id !== a.customer_party_id)
      throw fail("The unit and customer cannot change after a sale is recorded.");
    if (!d.version) throw fail("Refresh this sale before saving.", 409);
    await c.query("SELECT edit_sale_plan($1,$2,$3)", [id, d.version, JSON.stringify(d)]);
  } else {
    const u = (
      await c.query("SELECT * FROM sale_units WHERE id=$1 AND project_id=$2 AND is_active", [
        d.unit_id,
        projectId,
      ])
    ).rows[0];
    if (!u) throw fail("Choose an active unit in this project.");
    if (
      (
        await c.query("SELECT 1 FROM sale_agreements WHERE unit_id=$1 AND status='active'", [
          d.unit_id,
        ])
      ).rowCount
    )
      throw fail("This unit already has an active sale.", 409);
    if (
      !(await c.query("SELECT 1 FROM parties WHERE id=$1 AND type='client'", [d.customer_party_id]))
        .rowCount
    )
      throw fail("Choose a customer from the customer list.");
    id = randomUUID();
    await c.query(
      "INSERT INTO sale_agreements(id,project_id,unit_id,customer_party_id,agreement_date,total_price,discount,plan_type,notes,second_buyer_name,reference) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)",
      [
        id,
        projectId,
        d.unit_id,
        d.customer_party_id,
        d.agreement_date,
        d.total_price,
        d.discount,
        d.plan_type,
        d.notes,
        d.second_buyer_name,
        d.reference,
      ],
    );
    for (const s of d.schedule)
      await c.query(
        "INSERT INTO sale_installments(agreement_id,seq,label,due_date,amount) VALUES($1,$2,$3,$4,$5)",
        [id, s.seq, s.label, s.due_date, s.amount],
      );
  }
  await record(c, "sale.saved", id);
  return { id };
}
export async function voidSalePayment(
  c: pg.PoolClient,
  projectId: string,
  id: string,
  reason: string,
  expected?: string,
) {
  await lockSales(c, projectId);
  const p = (
    await c.query(
      "SELECT p.* FROM sale_payments p JOIN sale_agreements a ON a.id=p.agreement_id WHERE p.id=$1 AND a.project_id=$2",
      [id, projectId],
    )
  ).rows[0];
  if (!p || p.status !== "posted" || (expected && expected !== p.voucher_id))
    throw fail("This payment changed or was already voided. Refresh and try again.", 409);
  const a = await agreement(c, projectId, p.agreement_id);
  if (a.handover_date && !p.after_handover)
    throw fail("Undo handover before changing a payment received before handover.", 409);
  await voidVoucher(c, p.voucher_id, reason);
  await c.query("SELECT void_sale_payment($1)", [id]);
  const now = await agreement(c, projectId, p.agreement_id);
  if (now.received < 0 || now.received > now.total_price)
    throw fail("This change would leave an invalid remaining amount.", 409);
  await record(c, "payment.voided", id);
  return p;
}
export async function saveSalePayment(
  c: pg.PoolClient,
  projectId: string,
  input: unknown,
  replaceId?: string,
) {
  await lockSales(c, projectId);
  const d = salePaymentSchema.parse(input);
  if (replaceId) {
    if (!d.expectedVoucherId) throw fail("Refresh the payment before editing.", 409);
    const old = await voidSalePayment(
      c,
      projectId,
      replaceId,
      "Payment corrected",
      d.expectedVoucherId,
    );
    if (old.agreement_id !== d.agreement_id)
      throw fail("A corrected payment must belong to the same sale.");
  }
  const a = await agreement(c, projectId, d.agreement_id);
  if (d.amount > a.total_price - a.received)
    throw fail(
      `You cannot receive more than the PKR ${(a.total_price - a.received).toLocaleString("en-PK")} still owed.`,
      409,
    );
  if (d.received_on < a.agreement_date || (a.handover_date && d.received_on < a.handover_date))
    throw fail("Payment date must be on or after the sale and handover dates.");
  if (d.installment_id && !a.schedule.some((s) => s.id === d.installment_id))
    throw fail("Choose a payment plan row from this sale.");
  const id = randomUUID();
  const voucher = await postVoucher(c, {
    date: d.received_on,
    projectId,
    narration: `Payment received from ${a.customer_name}`,
    source: { module: "sale_payment", refId: id },
    lines: salesPosting("payment", a, d.amount, d.deposited_to),
  });
  const result = (
    await c.query(
      "INSERT INTO sale_payments(id,agreement_id,received_on,amount,method,reference,deposited_to,notes,installment_id,voucher_id,after_handover) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id,receipt_no,voucher_id",
      [
        id,
        a.id,
        d.received_on,
        d.amount,
        d.method,
        d.reference,
        d.deposited_to,
        d.notes,
        d.installment_id ?? null,
        voucher,
        !!a.handover_date,
      ],
    )
  ).rows[0];
  await record(c, "payment.received", id);
  return result;
}
export async function handoverSale(
  c: pg.PoolClient,
  projectId: string,
  id: string,
  date: string,
  version: number,
  confirmZero = false,
  undo = false,
) {
  await lockSales(c, projectId);
  const a = await agreement(c, projectId, id);
  if (a.version !== version) throw fail("This sale changed. Refresh and try again.", 409);
  if (undo) {
    if (!a.handover_voucher_id) throw fail("This unit has not been handed over.");
    if (
      (
        await c.query(
          "SELECT 1 FROM sale_payments WHERE agreement_id=$1 AND after_handover AND status='posted'",
          [id],
        )
      ).rowCount
    )
      throw fail("Void payments received after handover first.", 409);
    await voidVoucher(c, a.handover_voucher_id, "Handover undone");
    await c.query("SELECT transition_sale($1,$2,'void_handover',NULL,NULL)", [id, version]);
  } else {
    if (a.handover_date) throw fail("This unit is already handed over.", 409);
    if (!a.received && !confirmZero)
      throw fail("Confirm that you want to hand over with no money received.");
    if (
      date < a.agreement_date ||
      (
        await c.query(
          "SELECT 1 FROM sale_payments WHERE agreement_id=$1 AND status='posted' AND received_on>$2",
          [id, date],
        )
      ).rowCount
    )
      throw fail("Handover date cannot be before the sale or a recorded payment.");
    const voucher = await postVoucher(c, {
      date,
      projectId,
      narration: `Handover to ${a.customer_name}`,
      source: { module: "sale_handover", refId: id },
      lines: salesPosting("handover", a),
    });
    await c.query("SELECT transition_sale($1,$2,'handover',$3,$4)", [id, version, voucher, date]);
  }
  await record(c, undo ? "handover.voided" : "sale.handed_over", id);
  return { id };
}
export async function cancelSale(c: pg.PoolClient, projectId: string, id: string, input: unknown) {
  await lockSales(c, projectId);
  const d = saleCancelSchema.parse(input);
  const a = await agreement(c, projectId, id);
  if (a.handover_date)
    throw fail("This unit has been handed over. Undo handover before cancelling the sale.", 409);
  if (a.version !== d.version) throw fail("This sale changed. Refresh and try again.", 409);
  if (
    d.cancelled_on < a.agreement_date ||
    (
      await c.query(
        "SELECT 1 FROM sale_payments WHERE agreement_id=$1 AND status='posted' AND received_on>$2",
        [id, d.cancelled_on],
      )
    ).rowCount
  )
    throw fail("Cancellation cannot be before the sale or a recorded payment.");
  if (BigInt(d.refund_amount) + BigInt(d.forfeited_amount) !== BigInt(a.received))
    throw fail("Refund plus retained amount must equal the money received.");
  const available = await landAvailable(c, projectId);
  if (d.refund_amount > available[d.refund_paid_from])
    throw fail(`There is not enough money in ${d.refund_paid_from} for this refund.`, 409);
  let voucher: string | null = null;
  if (a.received)
    voucher = await postVoucher(c, {
      date: d.cancelled_on,
      projectId,
      narration: `Sale cancelled: ${d.reason}`,
      source: { module: "sale_cancel", refId: id },
      lines: salesPosting("cancel", a, d.refund_amount, d.refund_paid_from, d.forfeited_amount),
    });
  await c.query(
    "INSERT INTO sale_cancellations(agreement_id,cancelled_on,reason,refund_amount,forfeited_amount,refund_paid_from,refund_voucher_id) VALUES($1,$2,$3,$4,$5,$6,$7)",
    [
      id,
      d.cancelled_on,
      d.reason,
      d.refund_amount,
      d.forfeited_amount,
      d.refund_paid_from,
      voucher,
    ],
  );
  await c.query("SELECT transition_sale($1,$2,'cancel',$3,$4)", [
    id,
    d.version,
    voucher,
    d.cancelled_on,
  ]);
  await record(c, "sale.cancelled", id);
  return { id };
}
