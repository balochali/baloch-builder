// @vitest-environment node
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { expect, it, vi } from "vitest";
import { query } from "@/data/client";
import { listProjectPartners, listAllProjectPartners } from "@/data/repositories/projectPartnersRepository";
vi.mock("@/data/client", () => ({ query: vi.fn(), execute: vi.fn() }));
it("totals profit payouts per project and partner, excluding capital and archived payments", async () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(readFileSync("src-tauri/migrations/001_init.sql", "utf8"));
    db.exec(readFileSync("src-tauri/migrations/021_partner_construction_funding.sql", "utf8"));
    db.exec(`INSERT INTO contacts(id,name,created_at,updated_at) VALUES ('c','Ali','x','x');
      INSERT INTO partners(id,contact_id,created_at,updated_at) VALUES ('partner','c','x','x');
      INSERT INTO projects(id,name,created_at,updated_at) VALUES ('p1','One','x','x'),('p2','Two','x','x');
      INSERT INTO partnerships(id,project_id,partner_id,created_at,updated_at) VALUES ('s1','p1','partner','x','x'),('s2','p2','partner','x','x');`);
    const insert = db.prepare("INSERT INTO transactions(id,date,amount,direction,type,project_id,partner_id,custom,archived,created_at,updated_at) VALUES (?, '2026-10-01', ?, ?, ?, ?, ?, ?, ?, 'x', 'x')");
    insert.run('profit',75000,'out','partner_payout','p1','partner','{"purpose":"profit"}',0);
    insert.run('legacy',5000,'out','partner_payout','p1','partner','{}',0);
    insert.run('capital',30000,'out','partner_payout','p1','partner','{"purpose":"capital_return"}',0);
    insert.run('archived',40000,'out','partner_payout','p1','partner','{}',1);
    insert.run('other-project',10000,'out','partner_payout','p2','partner','{}',0);
    insert.run('contribution',200000,'in','partner_contribution','p1','partner','{}',0);
    vi.mocked(query).mockImplementation(async (sql, params = []) => db.prepare(sql).all(...params as (string | number | null)[]) as never);
    expect((await listProjectPartners('p1'))[0]).toMatchObject({contributed:200000,profit_paid:80000,capital_returned:30000});
    const all = await listAllProjectPartners();
    expect(all.find(p => p.project_id === 'p1')?.profit_paid).toBe(80000);
    expect(all.find(p => p.project_id === 'p2')?.profit_paid).toBe(10000);
    expect(all.find(p => p.project_id === 'p1')?.capital_returned).toBe(30000);
    expect(all.find(p => p.project_id === 'p2')?.capital_returned).toBe(0);
  } finally { db.close(); }
});
