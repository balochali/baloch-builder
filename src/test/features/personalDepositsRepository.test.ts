import { saveAmanatReceipt, listAmanatReceipts, listBankPaymentReceipts } from "@/data/repositories/documentsRepository";
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn().mockResolvedValue("receipts/test.png") }));
// @vitest-environment node
import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { query, execute } from "@/data/client";
import {
  DepositSchema,
  savePersonalDeposit,
  listPersonalDeposits,
  addDepositReturn,
  listDepositReturns,
} from "@/data/repositories/personalDepositsRepository";
import { listBankEntries, assignBankAccount } from "@/data/repositories/bankRepository";
import { resetBusinessData } from "@/data/repositories/resetRepository";
vi.mock("@/data/client", () => ({ query: vi.fn(), execute: vi.fn() }));
let database: DatabaseSync;
const input = {
  holder_name: "Ahmed",
  phone: "03001234567",
  amount: 100000,
  deposit_date: "2026-10-01",
  source: "partner" as const,
  source_details: "Ali’s partner payment",
  reason: "امانت برائے حفاظت",
  account_key: "personal" as const,
  method: "cash" as const,
};
beforeEach(() => {
  database = new DatabaseSync(":memory:");
  database.exec("PRAGMA foreign_keys = ON");
  for (const file of readdirSync("src-tauri/migrations")
    .filter((file) => file.endsWith(".sql"))
    .sort())
    database.exec(readFileSync(`src-tauri/migrations/${file}`, "utf8"));
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
it("persists the holder, partner source, Urdu reason and partial returns; includes each movement once in Bank", async () => {
  await savePersonalDeposit(input);
  const [deposit] = await listPersonalDeposits();
  expect(deposit.reason).toBe(input.reason);
  expect(deposit.source_details).toBe(input.source_details);
  await addDepositReturn({
    deposit_id: deposit.id,
    amount: 25000,
    return_date: "2026-10-03",
    account_key: "builder",
    method: "bank",
    notes: "Part returned",
  });
  expect((await listPersonalDeposits())[0].returned_amount).toBe(25000);
  expect(await listDepositReturns(deposit.id)).toHaveLength(1);
  const bank = await listBankEntries();
  expect(bank).toHaveLength(2);
  expect(bank.find((row) => row.direction === "out")?.amount).toBe(100000);
  expect(bank.find((row) => row.direction === "in")?.amount).toBe(25000);
  await assignBankAccount(bank[0], "personal");
  expect((await listBankEntries())[0].account_key).toBe("personal");
  await savePersonalDeposit({ ...input, reason: "Updated reason" }, deposit.id);
  expect((await listPersonalDeposits())[0].reason).toBe("Updated reason");
});
it("rejects excessive returns, earlier dates and edits that conflict with returns", async () => {
  await savePersonalDeposit(input);
  const [deposit] = await listPersonalDeposits();
  const returned = {
    deposit_id: deposit.id,
    amount: 70000,
    return_date: "2026-10-03",
    account_key: "personal" as const,
    method: "cash" as const,
    notes: "",
  };
  await expect(addDepositReturn({ ...returned, return_date: "2026-09-30" })).rejects.toThrow();
  await addDepositReturn(returned);
  await expect(addDepositReturn(returned)).rejects.toThrow();
  await expect(savePersonalDeposit({ ...input, amount: 60000 }, deposit.id)).rejects.toThrow();
  await expect(
    savePersonalDeposit({ ...input, deposit_date: "2026-10-04" }, deposit.id),
  ).rejects.toThrow();
  await addDepositReturn({ ...returned, amount: 30000 });
  expect((await listPersonalDeposits())[0].returned_amount).toBe(100000);
});
it("validates whole rupees, real dates and source descriptions", () => {
  expect(DepositSchema.safeParse({ ...input, amount: 1.5 }).success).toBe(false);
  expect(DepositSchema.safeParse({ ...input, deposit_date: "2026-02-31" }).success).toBe(false);
  expect(DepositSchema.safeParse({ ...input, source_details: " " }).success).toBe(false);
  expect(DepositSchema.safeParse({ ...input, amount: 0 }).success).toBe(false);
});
it("clears deposits and their returns with business reset", async () => {
  await savePersonalDeposit(input);
  const [deposit] = await listPersonalDeposits();
  await addDepositReturn({
    deposit_id: deposit.id,
    amount: 5000,
    return_date: "2026-10-03",
    account_key: "personal",
    method: "cash",
    notes: "",
  });
  await resetBusinessData();
  expect(await listPersonalDeposits()).toEqual([]);
  expect(await listDepositReturns(deposit.id)).toEqual([]);
  expect(await listBankEntries()).toEqual([]);
});

it.each(["cash", "bank", "digital", "cheque", "other"] as const)("persists %s payment details for deposits and returns", async method => {
 const payment_details = JSON.stringify({ method, received_by: "Bilal", provider: method === "cash" ? "" : "Provider", account: "12345", reference: "REF-9" });
 const id = await savePersonalDeposit({ ...input, method, payment_details });
 expect((await listPersonalDeposits())[0].payment_details).toBe(payment_details);
 await addDepositReturn({ deposit_id: id, amount: 1000, return_date: "2026-10-03", account_key: "personal", method, notes: "", payment_details });
 expect((await listDepositReturns(id))[0].payment_details).toBe(payment_details);
 expect((await listBankEntries()).every(row => row.payment_details === payment_details)).toBe(true);
});
it("rejects incomplete recipient and provider details", () => {
 expect(DepositSchema.safeParse({ ...input, payment_details: JSON.stringify({method: "bank", received_by: "", provider: "", account: "", reference: ""}) }).success).toBe(false);
});

it("stores receipt images against the correct deposit and return", async () => {
 const id = await savePersonalDeposit(input);
 const returnId = await addDepositReturn({deposit_id: id, amount: 1000, return_date: "2026-10-03", account_key: "personal", method: "cash", notes: ""});
 const file = new File(["image"], "proof.png", {type: "image/png"});
 await saveAmanatReceipt(id, "personal_deposit", file, input.deposit_date, "cash");
 await saveAmanatReceipt(returnId, "deposit_return", file, "2026-10-03", "cash");
 expect((await listAmanatReceipts(id))[0].doc_type).toBe("amanat_deposit_receipt");
 expect((await listAmanatReceipts(returnId))[0].doc_type).toBe("amanat_return_receipt");
 expect(await listBankPaymentReceipts()).toHaveLength(2);
 await expect(saveAmanatReceipt(id, "personal_deposit", new File(["bad"], "bad.exe", {type: "application/octet-stream"}), input.deposit_date, "cash")).rejects.toThrow("JPEG");
});
