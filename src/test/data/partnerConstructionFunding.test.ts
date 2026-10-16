// @vitest-environment node
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { expect, it, vi } from "vitest";
import { allocateFunding } from "@/data/repositories/partnerFundingRepository";
import { listProjectPartners } from "@/data/repositories/projectPartnersRepository";
import { query } from "@/data/client";
vi.mock("@/data/client", () => ({ query: vi.fn(), execute: vi.fn() }));
it("splits extra funding by shares and assigns rounding rupees without losing money", () => {
  const partners = [
    { partner_id: "a", name: "A", share_bp: 4000 },
    { partner_id: "b", name: "B", share_bp: 3000 },
    { partner_id: "c", name: "C", share_bp: 3000 },
  ];
  expect(allocateFunding(1000000, partners).map((p) => p.amount)).toEqual([400000, 300000, 300000]);
  expect(allocateFunding(11, partners).map((p) => p.amount)).toEqual([5, 3, 3]);
  expect(() => allocateFunding(100, partners.slice(1))).toThrow("100%");
});
it("separates land and construction and rejects excess or cross-project construction payments", async () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(readFileSync("src-tauri/migrations/001_init.sql", "utf8"));
    db.exec(readFileSync("src-tauri/migrations/021_partner_construction_funding.sql", "utf8"));
    db.exec(`INSERT INTO contacts(id,name,created_at,updated_at) VALUES ('c','Ali','x','x');
 INSERT INTO partners(id,contact_id,created_at,updated_at) VALUES ('a','c','x','x');
 INSERT INTO projects(id,name,created_at,updated_at) VALUES ('p','Project','x','x'),('p2','Other','x','x');
 INSERT INTO partnerships(id,project_id,partner_id,agreed_contribution,created_at,updated_at) VALUES ('s','p','a',1000,'x','x');
 INSERT INTO partner_funding_rounds VALUES ('r','p','Build',400,'[{"partner_id":"a","amount":400,"share_bp":10000}]','x');`);
    const insert = db.prepare(
      "INSERT INTO transactions(id,date,amount,direction,type,project_id,partner_id,custom,created_at,updated_at) VALUES (?,'2026-10-16',?,'in','partner_contribution',?,'a',?,'x','x')",
    );
    const custom = JSON.stringify({ contribution_purpose: "construction", funding_round_id: "r" });
    insert.run("land", 1000, "p", "{}");
    insert.run("build", 300, "p", custom);
    vi.mocked(query).mockImplementation(
      async (sql, params = []) =>
        db.prepare(sql).all(...(params as (string | number | null)[])) as never,
    );
    expect((await listProjectPartners("p"))[0]).toMatchObject({
      contributed: 1300,
      land_contributed: 1000,
      construction_contributed: 300,
      construction_required: 400,
      agreed_contribution: 1000,
    });
    expect(() => insert.run("excess", 101, "p", custom)).toThrow(/exceeds/);
    expect(() => insert.run("other", 1, "p2", custom)).toThrow(/invalid/);
    expect(() => db.exec("UPDATE transactions SET amount=500 WHERE id='build'")).toThrow(/exceeds/);
    insert.run("remainder", 100, "p", custom);
    db.exec("UPDATE transactions SET archived=1 WHERE id='build'");
    expect((await listProjectPartners("p"))[0]).toMatchObject({
      construction_contributed: 100,
      land_contributed: 1000,
    });
  } finally {
    db.close();
  }
});
