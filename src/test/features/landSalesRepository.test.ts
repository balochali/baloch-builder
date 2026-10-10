// @vitest-environment node
import { calculateProjectResult } from "@/features/projects/components/ProjectProfitLossPanel";
import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { query, execute } from "@/data/client";
import { recordLandSale, LandSaleSchema } from "@/data/repositories/landSalesRepository";
import { emptyPaymentDetails } from "@/data/repositories/projectPartnersRepository";
import { listProjectSales } from "@/data/repositories/projectSalesRepository";
import { listBankEntries } from "@/data/repositories/bankRepository";
import { updateProjectStatus } from "@/data/repositories/projectsRepository";
vi.mock("@/data/client", () => ({ query: vi.fn(), execute: vi.fn() }));
let db: DatabaseSync;
const projectId = "11111111-1111-4111-8111-111111111111",
  saleId = "22222222-2222-4222-8222-222222222222";
const input = {
  project_id: projectId,
  buyer_name: "Ahmed",
  buyer_phone: "03001234567",
  buyer_address: "Karachi",
  sale_date: "2026-10-10",
  price: 1500000,
  received: 1000000,
  account_key: "builder" as const,
  method: "cash" as const,
  reference: "",
  payment_details: { ...emptyPaymentDetails },
  notes: "Sale agreement",
};
beforeEach(() => {
  db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  for (const file of readdirSync("src-tauri/migrations")
    .filter((f) => f.endsWith(".sql"))
    .sort())
    db.exec(readFileSync("src-tauri/migrations/" + file, "utf8"));
  vi.mocked(query).mockImplementation(
    async (sql, params = []) =>
      db.prepare(sql).all(...(params as (string | number | null)[])) as never,
  );
  vi.mocked(execute).mockImplementation(async (sql, params = []) => ({
    rowsAffected: Number(db.prepare(sql).run(...(params as (string | number | null)[])).changes),
  }));
  db.prepare(
    "INSERT INTO projects (id,name,status,created_at,updated_at) VALUES (?, 'Project', 'planning', '2026-10-01', '2026-10-01')",
  ).run(projectId);
});
afterEach(() => db.close());
function acquire() {
  db.prepare(
    "INSERT INTO land (id,title,project_id,purchase_date,price,status,created_at,updated_at) VALUES ('land1', 'Plot', ?, '2026-10-02', 900000, 'acquired', '2026-10-02', '2026-10-02')",
  ).run(projectId);
}
it("blocks a sale and direct sold status without acquired land or a sale record", async () => {
  await expect(recordLandSale(saleId, input)).rejects.toThrow("Acquire the land first");
  await expect(updateProjectStatus(projectId, "land sold")).rejects.toThrow(
    "Record the acquired land sale",
  );
  acquire();
  await expect(updateProjectStatus(projectId, "land sold")).rejects.toThrow();
  expect(await listProjectSales(projectId)).toHaveLength(0);
});
it("saves price for profit, only received money in Bank, and status atomically; retries do not duplicate", async () => {
  acquire();
  await recordLandSale(saleId, input);
  await recordLandSale(saleId, input);
  const sales = await listProjectSales(projectId);
  expect(sales).toHaveLength(1);
  expect(sales[0]).toMatchObject({ kind: "land", price: 1500000, buyer_name: "Ahmed" });
  expect(db.prepare("SELECT status FROM projects WHERE id = ?").get(projectId)?.status).toBe(
    "land sold",
  );
  const entries = await listBankEntries();
  const incoming = entries.filter((e) => e.source === "project_sales");
  expect(incoming).toHaveLength(1);
  expect(incoming[0]).toMatchObject({ amount: 1000000, direction: "in", account_key: "builder" });
  const costs = entries.filter((e) => e.direction === "out").reduce((sum, e) => sum + e.amount, 0);
  expect(sales[0].price - costs).toBe(600000);
  const result = calculateProjectResult(
    sales,
    [{ amount: costs }],
    [{ name: "Partner", share_bp: 4000 }],
  );
  expect(result.result).toBe(600000);
  expect(result.allocations[0].amount).toBe(240000);
  await expect(recordLandSale("33333333-3333-4333-8333-333333333333", input)).rejects.toThrow();
});
it("rejects pre-acquisition sale dates and overpayments; unpaid sales do not invent bank receipts", async () => {
  acquire();
  await expect(recordLandSale(saleId, { ...input, sale_date: "2026-10-01" })).rejects.toThrow(
    "Sale date",
  );
  expect(LandSaleSchema.safeParse({ ...input, received: 2000000 }).success).toBe(false);
  expect(LandSaleSchema.safeParse({ ...input, sale_date: "2026-02-30" }).success).toBe(false);
  await recordLandSale(saleId, { ...input, received: 0 });
  expect((await listBankEntries()).filter((e) => e.source === "project_sales")).toHaveLength(0);
});
it("requires method-specific payment details", () => {
  expect(LandSaleSchema.safeParse({ ...input, method: "bank" }).success).toBe(false);
  expect(
    LandSaleSchema.safeParse({
      ...input,
      method: "bank",
      reference: "TR-1",
      payment_details: { ...emptyPaymentDetails, from_bank: "HBL", to_bank: "Meezan" },
    }).success,
  ).toBe(true);
});

it("preserves existing unit sales and document links when upgrading", () => {
  const legacy = new DatabaseSync(":memory:");
  try {
    legacy.exec("PRAGMA foreign_keys = ON");
    for (const file of readdirSync("src-tauri/migrations")
      .filter((f) => f.endsWith(".sql") && !f.startsWith("019"))
      .sort())
      legacy.exec(readFileSync("src-tauri/migrations/" + file, "utf8"));
    legacy.exec(
      "INSERT INTO projects (id,name,created_at,updated_at) VALUES ('p','Project','',''); INSERT INTO project_sales (id,project_id,kind,floor_index,unit_number,buyer_name,sale_date,price,created_at,updated_at) VALUES ('s','p','flat',1,'A1','Buyer','2026-10-01',3000000,'',''); INSERT INTO documents (id,title,owner_type,owner_id,created_at,updated_at) VALUES ('d','Agreement','project_sale','s','','');",
    );
    legacy.exec(readFileSync("src-tauri/migrations/019_land_sales.sql", "utf8"));
    expect(legacy.prepare("SELECT price FROM project_sales WHERE id='s'").get()?.price).toBe(
      3000000,
    );
    expect(
      legacy
        .prepare(
          "SELECT s.buyer_name FROM documents d JOIN project_sales s ON d.owner_id=s.id WHERE d.id='d'",
        )
        .get()?.buyer_name,
    ).toBe("Buyer");
  } finally {
    legacy.close();
  }
});
