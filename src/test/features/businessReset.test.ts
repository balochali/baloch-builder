// @vitest-environment node
import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import { expect, it } from "vitest";
function setup() {
  const db = new DatabaseSync(":memory:"); db.exec("PRAGMA foreign_keys = ON");
  for (const file of readdirSync("src-tauri/migrations").filter(file => file.endsWith(".sql")).sort()) db.exec(readFileSync(`src-tauri/migrations/${file}`, "utf8"));
  db.exec(`INSERT INTO settings VALUES ('login-test', 'keep');
    INSERT INTO projects (id, name, created_at, updated_at) VALUES ('p', 'Project', '', '');
    INSERT INTO contacts (id, name, created_at, updated_at) VALUES ('c', 'Ali', '', '');
    INSERT INTO partners (id, contact_id, created_at, updated_at) VALUES ('partner', 'c', '', '');
    INSERT INTO partnerships (id, project_id, partner_id, share_bp, created_at, updated_at) VALUES ('share', 'p', 'partner', 1000, '', '');
    INSERT INTO transactions (id, date, amount, direction, project_id, partner_id, contact_id, created_at, updated_at) VALUES ('t', '2026-09-30', 500, 'in', 'p', 'partner', 'c', '', '');
    INSERT INTO udhaars (id, borrower_name, amount, given_date, created_at, updated_at) VALUES ('u', 'Ali', 1000, '2026-09-30', '', '');
    INSERT INTO udhaar_payments (id, udhaar_id, amount, paid_date, created_at, updated_at) VALUES ('r', 'u', 100, '2026-09-30', '', '');
    INSERT INTO personal_expenses (id, category, item_name, amount, purchase_date, created_at, updated_at) VALUES ('e', 'other', 'Item', 100, '2026-09-30', '', '');`);
  return db;
}
it("resets business records repeatedly, keeps settings and permits fresh entries", () => {
  const db = setup();
  try {
    db.exec("INSERT INTO business_reset_requests VALUES (1)");
    for (const row of db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all()) {
      const name = String(row.name);
      if (name === "settings" || name.startsWith("sqlite_")) continue;
      expect(db.prepare(`SELECT COUNT(*) AS n FROM "${name}"`).get()?.n).toBe(0);
    }
    expect(db.prepare("SELECT value FROM settings WHERE key='login-test'").get()?.value).toBe("keep");
    db.exec("INSERT INTO business_reset_requests VALUES (1)");
    db.exec("INSERT INTO udhaars (id, borrower_name, amount, given_date, created_at, updated_at) VALUES ('fresh', 'New person', 100, '2026-09-30', '', '')");
    expect(db.prepare("SELECT COUNT(*) AS n FROM contacts").get()?.n).toBe(1);
  } finally { db.close(); }
});
it("rolls back every table when resetting fails", () => {
  const db = setup();
  try {
    db.exec("CREATE TRIGGER fail_reset BEFORE DELETE ON contacts BEGIN SELECT RAISE(ABORT, 'failure'); END;");
    expect(() => db.exec("INSERT INTO business_reset_requests VALUES (1)")).toThrow("failure");
    expect(db.prepare("SELECT COUNT(*) AS n FROM transactions").get()?.n).toBe(1);
    expect(db.prepare("SELECT COUNT(*) AS n FROM udhaar_payments").get()?.n).toBe(1);
  } finally { db.close(); }
});
