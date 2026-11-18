import type pg from "pg";
import { generateInstallments, type FeasibilityData } from "@baloch/shared";
import {
  generateSaleUnits,
  readSales,
  saveSaleUnit,
  saveSaleAgreement,
  saveSalePayment,
  handoverSale,
} from "../server/src/sales";
export async function seedSales(c: pg.PoolClient, projectId: string, plan: FeasibilityData) {
  await generateSaleUnits(c, projectId, { prefix: "A-", start: 101 });
  let sheet = await readSales(c, projectId);
  const building = (
    await c.query("SELECT details->'building' AS building FROM projects WHERE id=$1", [projectId])
  ).rows[0].building;
  for (const u of sheet.units) {
    if (sheet.agreements.some((a) => a.unit_id === u.id)) continue;
    const type = building.units.find((t: { id: string }) => t.id === u.source_unit_type_id);
    const row = plan.salesRows.find(
      (r) =>
        r.buildingUnitId === u.source_unit_type_id ||
        r.unitType.toLowerCase() === type?.name.toLowerCase(),
    );
    const price = Math.round(u.size_sqft * (row?.minRatePerSqft ?? 10000));
    if (u.list_price !== price) await saveSaleUnit(c, projectId, { ...u, list_price: price }, u.id);
  }
  const names = ["Ali Khan", "Sara Ahmed", "Usman Baloch"];
  const customers: string[] = [];
  for (const name of names) {
    let p = (await c.query("SELECT id FROM parties WHERE type='client' AND name=$1", [name]))
      .rows[0];
    if (!p)
      p = (
        await c.query(
          "INSERT INTO parties(name,type,phone) VALUES($1,'client','0300-0000000') RETURNING id",
          [name],
        )
      ).rows[0];
    customers.push(p.id);
  }
  sheet = await readSales(c, projectId);
  const flats = sheet.units.filter((u) => u.category === "Flat");
  const shop = sheet.units.find((u) => u.category === "Shop");
  if (flats.length < 3 || !shop) throw new Error("Demo needs at least three flats and one shop");
  const today = new Date().toISOString().slice(0, 10);
  const past = new Date();
  past.setUTCMonth(past.getUTCMonth() - 4);
  const first = past.toISOString().slice(0, 10);
  for (const [index, u] of [flats[0], flats[1], shop, flats[2]].entries()) {
    const ref = "sales-demo-" + index;
    if (sheet.agreements.some((a) => a.reference === ref)) continue;
    if (sheet.agreements.some((a) => a.unit_id === u.id))
      throw new Error("Demo unit already has another sale; no records were replaced");
    const price = u.list_price;
    const schedule =
      index === 1
        ? generateInstallments({
            price,
            downPayment: Math.floor(price * 0.2),
            count: 10,
            firstDueDate: first,
          })
        : index === 2
          ? [
              { seq: 1, label: "Booking", due_date: first, amount: Math.floor(price * 0.3) },
              {
                seq: 2,
                label: "On possession",
                due_date: "2027-12-31",
                amount: price - Math.floor(price * 0.3),
              },
            ]
          : [{ seq: 1, label: "Full payment", due_date: first, amount: price }];
    const a = await saveSaleAgreement(c, projectId, {
      unit_id: u.id,
      customer_party_id: customers[index % 3],
      agreement_date: first,
      total_price: price,
      plan_type: index === 1 ? "installments" : index === 2 ? "custom" : "full",
      reference: ref,
      schedule,
    });
    const payments =
      index === 1
        ? schedule.slice(0, 3).map((s) => s.amount)
        : index === 2
          ? [Math.floor(price * 0.2)]
          : [price];
    for (const amount of payments)
      await saveSalePayment(c, projectId, {
        agreement_id: a.id,
        received_on: today,
        amount,
        method: "bank_transfer",
        deposited_to: "bank",
        reference: ref,
      });
    if (index === 3) {
      const current = (await readSales(c, projectId)).agreements.find((x) => x.id === a.id)!;
      await handoverSale(c, projectId, a.id, today, current.version);
    }
  }
  const final = await readSales(c, projectId);
  const active = final.agreements.filter((a) => a.status === "active");
  const expected = {
    advances: active.filter((a) => !a.handover_date).reduce((s, a) => s + a.received, 0),
    receivables: active
      .filter((a) => a.handover_date)
      .reduce((s, a) => s + a.total_price - a.received, 0),
    revenue: active.filter((a) => a.handover_date).reduce((s, a) => s + a.total_price, 0),
  };
  const actual = (
    await c.query(
      "SELECT l.account_code,sum(l.credit-l.debit)::text AS amount FROM journal_lines l JOIN journal_vouchers v ON v.id=l.voucher_id WHERE l.project_id=$1 AND v.status='posted' AND v.reversal_of IS NULL AND l.account_code IN ('2200','1100','4000') GROUP BY l.account_code",
      [projectId],
    )
  ).rows;
  const value = (code: string) => Number(actual.find((r) => r.account_code === code)?.amount ?? 0);
  if (
    value("2200") !== expected.advances ||
    -value("1100") !== expected.receivables ||
    value("4000") !== expected.revenue
  )
    throw new Error("Demo sales trial balance does not match the active sales");
  console.log("Sales demo verified: advances, receivables and revenue reconcile to the journal.");
}
