// @vitest-environment node
import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { query, execute } from "@/data/client";
import {
  ContractorSchema,
  saveProjectContractor,
  listProjectContractors,
  addContractorPayment,
  listContractorPayments,
} from "@/data/repositories/projectContractorsRepository";
import {
  listConstructionCosts,
  listActualProjectCosts,
} from "@/data/repositories/projectFinanceRepository";
import { listBankEntries } from "@/data/repositories/bankRepository";
import { resetBusinessData } from "@/data/repositories/resetRepository";
vi.mock("@/data/client", () => ({ query: vi.fn(), execute: vi.fn() }));
let db: DatabaseSync;
const project = "11111111-1111-4111-8111-111111111111";
const other = "22222222-2222-4222-8222-222222222222";
const agreement = {
  project_id: project,
  name: "Ahmed",
  phone: "03001234567",
  address: "Quetta",
  scope: "Structure and finishing labour",
  agreed_amount: 100000,
  agreement_date: "2026-10-01",
  notes: "Labour only",
};
beforeEach(() => {
  db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys=ON");
  for (const file of readdirSync("src-tauri/migrations")
    .filter((f) => f.endsWith(".sql"))
    .sort())
    db.exec(readFileSync("src-tauri/migrations/" + file, "utf8"));
  db.prepare(
    "INSERT INTO projects(id,name,created_at,updated_at) VALUES (?, 'Project', 'x', 'x'), (?, 'Other', 'x', 'x')",
  ).run(project, other);
  vi.mocked(query).mockImplementation(
    async (sql, params = []) =>
      db.prepare(sql).all(...(params as (string | number | null)[])) as never,
  );
  vi.mocked(execute).mockImplementation(async (sql, params = []) => ({
    rowsAffected: Number(db.prepare(sql).run(...(params as (string | number | null)[])).changes),
  }));
});
afterEach(() => db.close());
async function payment(amount = 25000) {
  const contractor_id = await saveProjectContractor(agreement);
  return {
    project_id: project,
    contractor_id,
    amount,
    date: "2026-10-02",
    account_key: "builder" as const,
    method: "cash" as const,
    reference: "R-1",
    provider: "",
    received_by: "Ahmed",
    notes: "First instalment",
  };
}
it("keeps dated payments once in contractor, construction costs and Bank totals", async () => {
  const input = await payment();
  await addContractorPayment(input);
  await addContractorPayment({
    ...input,
    date: "2026-10-05",
    amount: 15000,
    method: "bank",
    provider: "HBL",
  });
  expect((await listProjectContractors(project))[0]).toMatchObject({
    name: "Ahmed",
    agreed_amount: 100000,
    paid: 40000,
  });
  expect(await listContractorPayments(project)).toHaveLength(2);
  expect(await listConstructionCosts(project)).toHaveLength(2);
  expect(await listActualProjectCosts(project)).toHaveLength(2);
  const bank = await listBankEntries();
  expect(bank).toHaveLength(2);
  expect(bank.reduce((sum, p) => sum + p.amount, 0)).toBe(40000);
  expect(bank.every((p) => p.direction === "out" && p.description.includes("Ahmed"))).toBe(true);
  expect(await listProjectContractors(other)).toEqual([]);
});
it("rejects cross-project, early and excessive payments without inserting a cost", async () => {
  const input = await payment();
  await expect(addContractorPayment({ ...input, project_id: other })).rejects.toThrow();
  await expect(addContractorPayment({ ...input, date: "2026-09-30" })).rejects.toThrow();
  await expect(addContractorPayment({ ...input, amount: 100001 })).rejects.toThrow();
  expect(await listActualProjectCosts(project)).toHaveLength(0);
  await addContractorPayment({ ...input, amount: 100000 });
  await expect(addContractorPayment(input)).rejects.toThrow();
});
it("guards agreement and sheet edits, and recalculates archived payments", async () => {
  const input = await payment();
  const id = await addContractorPayment(input);
  await expect(
    saveProjectContractor({ ...agreement, agreed_amount: 20000 }, input.contractor_id),
  ).rejects.toThrow();
  await expect(
    saveProjectContractor({ ...agreement, agreement_date: "2026-10-03" }, input.contractor_id),
  ).rejects.toThrow();
  await expect(execute("UPDATE transactions SET amount=120000 WHERE id=?", [id])).rejects.toThrow();
  await saveProjectContractor({ ...agreement, agreed_amount: 150000 }, input.contractor_id);
  await execute("UPDATE transactions SET amount=30000 WHERE id=?", [id]);
  expect((await listProjectContractors(project))[0].paid).toBe(30000);
  await execute("UPDATE transactions SET archived=1 WHERE id=?", [id]);
  expect((await listProjectContractors(project))[0].paid).toBe(0);
});
it("validates agreements and removes contractors with a business reset", async () => {
  expect(ContractorSchema.safeParse({ ...agreement, agreement_date: "2026-02-30" }).success).toBe(
    false,
  );
  expect(ContractorSchema.safeParse({ ...agreement, agreed_amount: 1.5 }).success).toBe(false);
  const input = await payment();
  await addContractorPayment(input);
  await resetBusinessData();
  expect(await query("SELECT * FROM project_contractors")).toHaveLength(0);
  expect(await query("SELECT * FROM transactions")).toHaveLength(0);
});
