import {
  addSaleRefund,
  recordSaleEvent,
  projectSaleFees,
  listSaleEvents,
} from "@/data/repositories/saleEventsRepository";
// @vitest-environment node
import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { query, execute } from "@/data/client";
import { addProjectSale, type ProjectSaleInput } from "@/data/repositories/projectSalesRepository";
import {
  addSalePayment,
  listSalePayments,
  SalePaymentSchema,
} from "@/data/repositories/salePaymentsRepository";
import { emptyPaymentDetails } from "@/data/repositories/projectPartnersRepository";
import { listBankEntries } from "@/data/repositories/bankRepository";
vi.mock("@/data/client", () => ({ query: vi.fn(), execute: vi.fn() }));
let db: DatabaseSync;
const project = "11111111-1111-4111-8111-111111111111";
const sale: ProjectSaleInput = {
  project_id: project,
  kind: "flat",
  floor_index: 0,
  unit_number: "A1",
  rooms: 2,
  buyer_name: "Ali",
  buyer_phone: "",
  buyer_address: "",
  sale_date: "2026-10-01",
  price: 1000000,
  notes: "",
};
const payment = {
  amount: 100000,
  date: "2026-10-01",
  account_key: "builder" as const,
  method: "cash" as const,
  reference: "",
  payment_details: { ...emptyPaymentDetails },
};
beforeEach(() => {
  db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys=ON");
  for (const f of readdirSync("src-tauri/migrations")
    .filter((f) => f.endsWith(".sql"))
    .sort())
    db.exec(readFileSync("src-tauri/migrations/" + f, "utf8"));
  db.prepare("INSERT INTO projects(id,name,created_at,updated_at) VALUES(?,'Project','x','x')").run(
    project,
  );
  vi.mocked(query).mockImplementation(
    async (sql, params = []) =>
      db.prepare(sql).all(...(params as (string | number | null)[])) as never,
  );
  vi.mocked(execute).mockImplementation(async (sql, params = []) => {
    const result = db.prepare(sql).run(...(params as (string | number | null)[]));
    return { rowsAffected: Number(result.changes), lastInsertId: Number(result.lastInsertRowid) };
  });
});
afterEach(() => db.close());
it("saves first payment with sale and later instalments once in Bank", async () => {
  const row = await addProjectSale(sale, payment);
  expect(await listSalePayments(project)).toHaveLength(1);
  await addSalePayment(project, row.id, { ...payment, amount: 200000, date: "2026-10-05" });
  expect((await listSalePayments(project)).reduce((s, p) => s + p.amount, 0)).toBe(300000);
  const bank = (await listBankEntries()).filter((p) => p.category === "Buyer instalment");
  expect(bank).toHaveLength(2);
  expect(bank.every((p) => p.person === "Ali" && p.account_key === "builder")).toBe(true);
});
it("rejects overpayments, early dates, wrong projects and conflicting sale edits", async () => {
  const row = await addProjectSale(sale, payment);
  await expect(addSalePayment(project, row.id, { ...payment, amount: 900001 })).rejects.toThrow(
    /balance/,
  );
  await expect(addSalePayment(project, row.id, { ...payment, date: "2026-09-30" })).rejects.toThrow(
    /predates/,
  );
  await expect(addSalePayment("other", row.id, payment)).rejects.toThrow();
  expect(() => db.prepare("UPDATE project_sales SET price=1 WHERE id=?").run(row.id)).toThrow(
    /payments/,
  );
  expect(() => db.prepare("UPDATE project_sales SET archived=1 WHERE id=?").run(row.id)).toThrow(
    /payments/,
  );
  expect(await listSalePayments(project)).toHaveLength(1);
  expect(SalePaymentSchema.safeParse({ ...payment, method: "bank" }).success).toBe(false);
});
it("rolls back the sale if its first payment fails and permits an unpaid booking", async () => {
  const custom = JSON.stringify({ initial_payment: { ...payment, id: "bad", amount: 2000000 } });
  expect(() =>
    db
      .prepare(
        "INSERT INTO project_sales(id,project_id,kind,floor_index,unit_number,buyer_name,sale_date,price,created_at,updated_at,custom) VALUES('bad',?,'flat',0,'A1','Ali','2026-10-01',1000000,'x','x',?)",
      )
      .run(project, custom),
  ).toThrow(/balance/);
  expect(db.prepare("SELECT COUNT(*) AS n FROM project_sales").get()?.n).toBe(0);
  await addProjectSale(sale, null);
  expect(await listSalePayments(project)).toHaveLength(0);
});

it("cancels with a deduction from received money and records exactly one refund", async () => {
  const row = await addProjectSale(sale, { ...payment, amount: 200000 });
  await recordSaleEvent(row, {
    kind: "cancel",
    date: "2026-10-02",
    received: 200000,
    rate: 10,
    resale_price: 0,
    new_buyer_name: "",
    new_buyer_phone: "",
    new_buyer_address: "",
    payment: { ...payment, amount: 180000 },
  });
  expect(await projectSaleFees(project)).toBe(20000);
  const events = await listSaleEvents(project);
  expect(events[0]).toMatchObject({ fee: 20000, refund: 180000, rate_bp: 1000 });
  const bank = await listBankEntries();
  expect(bank.filter((r) => r.category === "Buyer refund")).toHaveLength(1);
  expect(bank.reduce((total, r) => total + (r.direction === "in" ? r.amount : -r.amount), 0)).toBe(
    20000,
  );
  expect(db.prepare("SELECT archived FROM project_sales WHERE id=?").get(row.id)?.archived).toBe(1);
  await addProjectSale(sale, null);
});
it("only resells a fully paid unit, preserves original revenue and records commission", async () => {
  const row = await addProjectSale(sale, payment);
  const input = {
    kind: "resell" as const,
    date: "2026-10-02",
    received: 100000,
    rate: 2,
    resale_price: 1500000,
    new_buyer_name: "New buyer",
    new_buyer_phone: "0300",
    new_buyer_address: "Karachi",
    payment,
  };
  await expect(recordSaleEvent(row, input)).rejects.toThrow(/settle all original/);
  await addSalePayment(project, row.id, { ...payment, amount: 900000 });
  await recordSaleEvent(row, { ...input, received: 1000000 });
  expect(
    db.prepare("SELECT buyer_name,price FROM project_sales WHERE id=?").get(row.id),
  ).toMatchObject({ buyer_name: "New buyer", price: 1000000 });
  expect(await projectSaleFees(project)).toBe(30000);
  const bank = await listBankEntries();
  expect(bank.filter((r) => r.category === "Resale commission")).toHaveLength(1);
  expect(
    bank.filter((r) => r.category === "Buyer instalment").every((r) => r.person === "Ali"),
  ).toBe(true);
  expect(bank.reduce((sum, r) => sum + r.amount, 0)).toBe(1030000);
});
it("rejects stale settlements without refunding or changing ownership", async () => {
  const row = await addProjectSale(sale, payment);
  await addSalePayment(project, row.id, payment);
  await expect(
    recordSaleEvent(row, {
      kind: "cancel",
      date: "2026-10-02",
      received: 100000,
      rate: 10,
      resale_price: 0,
      new_buyer_name: "",
      new_buyer_phone: "",
      new_buyer_address: "",
      payment: null,
    }),
  ).rejects.toThrow(/balance changed/);
  expect(await listSaleEvents(project)).toHaveLength(0);
  expect(db.prepare("SELECT archived FROM project_sales WHERE id=?").get(row.id)?.archived).toBe(0);
});

it("refunds cancellation in phases and guards the remaining balance in SQL", async () => {
  const row = await addProjectSale(sale, { ...payment, amount: 200000 });
  await recordSaleEvent(row, {
    kind: "cancel",
    date: "2026-10-02",
    received: 200000,
    rate: 10,
    resale_price: 0,
    new_buyer_name: "",
    new_buyer_phone: "",
    new_buyer_address: "",
    payment: { ...payment, amount: 50000 },
  });
  const [event] = await listSaleEvents(project);
  expect(event).toMatchObject({ refund: 180000, refunded: 50000 });
  await addSaleRefund(event, { ...payment, amount: 80000, date: "2026-10-03" });
  await expect(
    addSaleRefund(event, { ...payment, amount: 80000, date: "2026-10-04" }),
  ).rejects.toThrow(/balance/);
  await expect(addSaleRefund(event, { ...payment, amount: 1, date: "2026-10-01" })).rejects.toThrow(
    /predates/,
  );
  await addSaleRefund(event, { ...payment, amount: 50000, date: "2026-10-05" });
  const [settled] = await listSaleEvents(project);
  expect(settled.refunded).toBe(180000);
  expect(JSON.parse(settled.refund_payments)).toHaveLength(3);
  expect((await listBankEntries()).filter((r) => r.category === "Buyer refund")).toHaveLength(3);
  expect(await projectSaleFees(project)).toBe(20000);
});
it("allows cancellation before the first refund is paid", async () => {
  const row = await addProjectSale(sale, payment);
  await recordSaleEvent(row, {
    kind: "cancel",
    date: "2026-10-02",
    received: 100000,
    rate: 0,
    resale_price: 0,
    new_buyer_name: "",
    new_buyer_phone: "",
    new_buyer_address: "",
    payment: null,
  });
  const [event] = await listSaleEvents(project);
  expect(event.refunded).toBe(0);
  await addSaleRefund(event, { ...payment, date: "2026-10-03" });
  expect((await listSaleEvents(project))[0].refunded).toBe(100000);
});
