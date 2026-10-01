import { listBankEntries, assignBankAccount } from "@/data/repositories/bankRepository";
import { createPersonalExpense, updatePersonalExpense } from "@/data/repositories/personalExpenseRepository";
import { addConstructionCost } from "@/data/repositories/projectFinanceRepository";
// @vitest-environment node
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import {
  addPersonUdhaarPayment,
  listAllUdhaarPayments,
  createUdhaar,
  listUdhaars,
  clearAllUdhaarData,
} from "@/data/repositories/udhaarRepository";
import { query, execute } from "@/data/client";

vi.mock("@/data/client", () => ({ query: vi.fn(), execute: vi.fn() }));
let database: DatabaseSync;
const contactId = "22222222-2222-4222-8222-222222222222";
const input = {
  account_key: "builder" as const,
  borrower_name: "Ali",
  phone: "03001234567",
  amount: 50000,
  given_date: "2026-09-29",
  due_date: null,
  notes: "",
};
beforeEach(() => {
  database = new DatabaseSync(":memory:");
  database.exec("PRAGMA foreign_keys = ON");
  for (const file of ["001_init", "006_udhaars", "007_personal_expenses", "008_udhaar_contacts", "009_udhaar_delete", "010_udhaar_payment_guard", "011_bank_accounts", "013_expense_payment_details"]) {
    database.exec(readFileSync(`src-tauri/migrations/${file}.sql`, "utf8"));
  }
  vi.mocked(query).mockImplementation(
    async (sql, params = []) =>
      database.prepare(sql).all(...(params as (string | number | null)[])) as never,
  );
  vi.mocked(execute).mockImplementation(async (sql, params = []) => ({
    rowsAffected: Number(
      database.prepare(sql).run(...(params as (string | number | null)[])).changes,
    ),
  }));
});
afterEach(() => database.close());

it("creates a new contact and loan atomically and reads later contact edits", async () => {
  await createUdhaar(input);
  const [loan] = await listUdhaars();
  expect(loan.contact_id).toBeTruthy();
  expect(database.prepare("SELECT COUNT(*) AS count FROM contacts").get()?.count).toBe(1);
  database
    .prepare("UPDATE contacts SET name = ?, phone = NULL WHERE id = ?")
    .run("Ali Baloch", loan.contact_id!);
  expect((await listUdhaars())[0]).toMatchObject({
    borrower_name: "Ali Baloch",
    phone: null,
    amount: 50000,
  });
});

it("reuses an existing contact and ignores stale form identity values", async () => {
  database
    .prepare(
      "INSERT INTO contacts (id, name, phone, created_at, updated_at) VALUES (?, 'Ahmed', '03112223344', '', '')",
    )
    .run(contactId);
  await createUdhaar({ ...input, contact_id: contactId });
  expect((await listUdhaars())[0]).toMatchObject({
    contact_id: contactId,
    borrower_name: "Ahmed",
    phone: "03112223344",
  });
  expect(database.prepare("SELECT COUNT(*) AS count FROM contacts").get()?.count).toBe(1);
});

it("rejects an archived contact without creating a loan", async () => {
  database
    .prepare(
      "INSERT INTO contacts (id, name, archived, created_at, updated_at) VALUES (?, 'Ahmed', 1, '', '')",
    )
    .run(contactId);
  await expect(createUdhaar({ ...input, contact_id: contactId })).rejects.toThrow(
    "no longer available",
  );
  expect(await listUdhaars()).toHaveLength(0);
});

it("rolls back the loan if creating its contact fails", async () => {
  database.exec(
    "CREATE TRIGGER reject_contact BEFORE INSERT ON contacts BEGIN SELECT RAISE(ABORT, 'Contact failure'); END;",
  );
  await expect(createUdhaar(input)).rejects.toThrow("Contact failure");
  expect(await listUdhaars()).toHaveLength(0);
});

it("links only unambiguous historical name and phone matches", () => {
  const old = new DatabaseSync(":memory:");
  try {
    for (const file of ["001_init", "006_udhaars"])
      old.exec(readFileSync(`src-tauri/migrations/${file}.sql`, "utf8"));
    old.exec(`INSERT INTO contacts (id, name, phone, created_at, updated_at) VALUES
      ('c1', 'Ali', '0300', '', ''), ('c2', 'Bilal', '0311', '', ''), ('c3', 'Bilal', '0311', '', '');
      INSERT INTO udhaars (id, borrower_name, phone, amount, given_date, created_at, updated_at) VALUES
      ('l1', 'Ali', '0300', 100, '2026-01-01', '', ''),
      ('l2', 'Bilal', '0311', 100, '2026-01-01', '', ''),
      ('l3', 'Ali', NULL, 100, '2026-01-01', '', '');`);
    old.exec(readFileSync("src-tauri/migrations/008_udhaar_contacts.sql", "utf8"));
    expect(
      old
        .prepare("SELECT contact_id FROM udhaars ORDER BY id")
        .all()
        .map((row) => row.contact_id),
    ).toEqual(["c1", null, null]);
  } finally {
    old.close();
  }
});

it("clears loans and repayments while preserving contacts and other records", async () => {
  await createUdhaar(input);
  const loan = (await listUdhaars())[0];
  database
    .prepare(
      "INSERT INTO udhaar_payments (id, udhaar_id, amount, paid_date, created_at, updated_at) VALUES ('payment', ?, 1000, '2026-09-29', '', '')",
    )
    .run(loan.id);
  database.exec("INSERT INTO settings (key, value) VALUES ('test', 'kept')");
  await clearAllUdhaarData();
  expect(await listUdhaars()).toHaveLength(0);
  expect(database.prepare("SELECT COUNT(*) AS n FROM udhaar_payments").get()?.n).toBe(0);
  expect(database.prepare("SELECT COUNT(*) AS n FROM contacts").get()?.n).toBe(1);
  expect(database.prepare("SELECT value FROM settings WHERE key = 'test'").get()?.value).toBe(
    "kept",
  );
});

it("rolls back all deletion if a repayment cannot be removed", async () => {
  await createUdhaar(input);
  const loan = (await listUdhaars())[0];
  database
    .prepare(
      "INSERT INTO udhaar_payments (id, udhaar_id, amount, paid_date, created_at, updated_at) VALUES ('payment', ?, 1000, '2026-09-29', '', '')",
    )
    .run(loan.id);
  database.exec(
    "CREATE TRIGGER refuse_delete BEFORE DELETE ON udhaar_payments BEGIN SELECT RAISE(ABORT, 'failure'); END;",
  );
  await expect(clearAllUdhaarData()).rejects.toThrow("failure");
  expect(await listUdhaars()).toHaveLength(1);
  expect(database.prepare("SELECT COUNT(*) AS n FROM udhaar_payments").get()?.n).toBe(1);
});

it("accepts one repayment larger than a single loan and allocates it oldest-first", async () => {
  await createUdhaar({ ...input, amount: 80000, given_date: "2026-09-01" });
  const first = (await listUdhaars())[0];
  await createUdhaar({ ...input, contact_id: first.contact_id, amount: 200000 });
  await addPersonUdhaarPayment({
    account_key: "personal", udhaar_id: first.id,
    amount: 200000,
    paid_date: "2026-09-30",
    method: "cash",
    notes: "Combined payment",
  });
  const loans = await listUdhaars();
  expect(loans.find((loan) => loan.id === first.id)?.paid_amount).toBe(80000);
  expect(loans.find((loan) => loan.id !== first.id)?.paid_amount).toBe(120000);
  const payments = await listAllUdhaarPayments();
  expect(new Set(payments.map((payment) => payment.payment_group_id)).size).toBe(1);
  await expect(
    addPersonUdhaarPayment({
      account_key: "personal", udhaar_id: first.id,
      amount: 80001,
      paid_date: "2026-09-30",
      method: "cash",
      notes: "",
    }),
  ).rejects.toThrow("outstanding balance");
});
it("rolls back every allocation when one allocation fails", async () => {
  await createUdhaar({ ...input, amount: 80000, given_date: "2026-09-01" });
  const first = (await listUdhaars())[0];
  await createUdhaar({ ...input, contact_id: first.contact_id, amount: 200000 });
  database.exec(
    "CREATE TRIGGER reject_second BEFORE INSERT ON udhaar_payments WHEN NEW.amount = 120000 BEGIN SELECT RAISE(ABORT, 'failure'); END;",
  );
  await expect(
    addPersonUdhaarPayment({
      account_key: "personal", udhaar_id: first.id,
      amount: 200000,
      paid_date: "2026-09-30",
      method: "cash",
      notes: "",
    }),
  ).rejects.toThrow("failure");
  expect(await listAllUdhaarPayments()).toHaveLength(0);
});

it("rejects repayments dated before eligible borrowing", async () => {
  await createUdhaar(input);
  const loan = (await listUdhaars())[0];
  await expect(addPersonUdhaarPayment({ account_key: "personal", udhaar_id: loan.id, amount: 10000, paid_date: "2026-09-01", method: "cash", notes: "" })).rejects.toThrow("for this date");
  expect(await listAllUdhaarPayments()).toHaveLength(0);
});

it("combines source records without duplicating repayments and synchronizes account changes and deletion", async () => {
  await createUdhaar({ ...input, amount: 80000, given_date: "2026-09-01" });
  const first = (await listUdhaars())[0];
  await createUdhaar({ ...input, contact_id: first.contact_id, amount: 200000 });
  await addPersonUdhaarPayment({ account_key: "personal", udhaar_id: first.id, amount: 200000, paid_date: "2026-09-30", method: "cash", notes: "Combined" });
  const expense = { account_key: "personal" as const, category: "car" as const, item_name: "Car", amount: 1000, purchase_date: "2026-09-30", notes: "" };
  await createPersonalExpense(expense);
  const project = "33333333-3333-4333-8333-333333333333";
  database.prepare("INSERT INTO projects (id, name, created_at, updated_at) VALUES (?, 'Site', '', '')").run(project);
  await addConstructionCost({ project_id: project, account_key: "builder", date: "2026-09-30", amount: 5000, description: "Cement", method: "cash", reference: "" });
  let entries = await listBankEntries();
  expect(entries).toHaveLength(5);
  expect(entries.filter(entry => entry.category === "Udhaar repayment")).toHaveLength(1);
  const repayment = entries.find(entry => entry.category === "Udhaar repayment")!;
  expect(repayment).toMatchObject({ amount: 200000, direction: "in", account_key: "personal" });
  await assignBankAccount(repayment, "builder");
  expect(database.prepare("SELECT DISTINCT account_key FROM udhaar_payments").all()).toEqual([{ account_key: "builder" }]);
  const purchase = entries.find(entry => entry.source === "personal_expenses")!;
  await updatePersonalExpense(purchase.source_id, { ...expense, amount: 1500, account_key: "builder" });
  expect((await listBankEntries()).find(entry => entry.id === purchase.id)).toMatchObject({ amount: 1500, account_key: "builder" });
  await clearAllUdhaarData();
  entries = await listBankEntries();
  expect(entries).toHaveLength(2);
  expect(entries.every(entry => entry.direction === "out")).toBe(true);
});
it("persists payment details on loans and every part of an overall repayment", async () => {
  const details = { method: "digital" as const, received_by: "Ali", provider: "JazzCash", account: "03001234567", reference: "TX-123" };
  await createUdhaar({ ...input, account_key: "personal", payment_details: details, amount: 80000, given_date: "2026-09-01" });
  const first = (await listUdhaars())[0];
  expect(JSON.parse(first.payment_details!)).toEqual(details);
  await createUdhaar({ ...input, contact_id: first.contact_id, amount: 200000 });
  await addPersonUdhaarPayment({ account_key: "personal", payment_details: details, udhaar_id: first.id, amount: 200000, paid_date: "2026-09-30", method: "digital", notes: "" });
  const payments = await listAllUdhaarPayments();
  expect(payments).toHaveLength(2);
  for (const payment of payments) expect(JSON.parse(payment.payment_details!)).toEqual(details);
  expect((await listBankEntries()).find(entry => entry.source_id === first.id)?.method).toBe("digital");
});
it("keeps purchase payment details when editing and exposes the method in Bank", async () => {
  const { listPersonalExpenses } = await import("@/data/repositories/personalExpenseRepository");
  const details = { method: "digital" as const, received_by: "Shop owner", provider: "JazzCash", account: "03001234567", reference: "R-123" };
  const input = { category: "watch" as const, item_name: "Watch", amount: 1000, purchase_date: "2026-09-30", notes: "", account_key: "personal" as const, payment_details: details };
  await createPersonalExpense(input);
  const purchase = (await listPersonalExpenses())[0];
  expect(purchase.payment_details).toEqual(details);
  await updatePersonalExpense(purchase.id, { ...input, payment_details: { ...details, reference: "R-456" } });
  expect((await listPersonalExpenses())[0].payment_details?.reference).toBe("R-456");
  expect((await listBankEntries())[0].method).toBe("digital");
});
