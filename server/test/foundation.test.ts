import { registerSessionTests } from "./session-security";
import { registerLoginSecurityTests } from "./login-security";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import argon2 from "argon2";
import { randomUUID } from "node:crypto";
import { buildApp } from "../src/app";
import { pool, transaction, assertRuntimeRole } from "../src/db";
import { migrate, ownerPool } from "../src/migrate";
import { seed } from "../src/seed";
import type { Role } from "@baloch/shared";
import { deniedRuntimeStatement, verifyFutureTable } from "./runtime-privileges";
for (const key of ["DATABASE_URL", "OWNER_DATABASE_URL"] as const) {
  const url = new URL(process.env[key] ?? "postgres://invalid/invalid");
  if (url.pathname !== "/baloch_test")
    throw new Error(`${key} must target the dedicated baloch_test database`);
}
const app = await buildApp();
const ids = {} as Record<Role, string>;
const cookies = {} as Record<Role, string>;
let project: string, otherProject: string, materialHead: string;
const account: Record<string, string> = {};
const headers = (role: Role) => ({ "x-requested-with": "BalochBuilder", cookie: cookies[role] });
const request = (
  role: Role,
  method: "GET" | "POST" | "PUT" | "PATCH",
  url: string,
  payload?: unknown,
) =>
  app.inject({
    method,
    url: `/api/${url}`,
    headers: headers(role),
    payload: payload as Record<string, unknown>,
  });
const draft = (amount = "10000", credit = "10000", type = "JV") => ({
  date: "2026-10-24",
  type,
  narration: "test",
  lines: [
    {
      accountId: account["1220"],
      costHeadId: materialHead,
      projectId: project,
      debit: amount,
      credit: "0",
      narration: "materials",
    },
    { accountId: account["2000"], projectId: project, debit: "0", credit, narration: "payable" },
  ],
});
async function make(body = draft()) {
  const r = await request("accountant", "POST", "vouchers", body);
  expect(r.statusCode, r.body).toBe(200);
  return r.json().id as string;
}
const sql = (text: string, values: unknown[] = [], role: Role = "accountant") =>
  transaction(ids[role], (c) => c.query(text, values));
beforeAll(async () => {
  // Dedicated disposable database only. Reset the schema, never a production database.
  await ownerPool.query(
    "DROP SCHEMA public CASCADE; CREATE SCHEMA public AUTHORIZATION baloch_owner",
  );
  await migrate();
  await migrate();
  await assertRuntimeRole();
  ids.admin = await seed("admin@example.test", "Test-password-123!");
  materialHead = (await pool.query("SELECT id FROM cost_heads WHERE code='MATERIALS'")).rows[0].id;
  for (const role of ["accountant", "sales", "construction"] as const) {
    ids[role] = (
      await transaction(ids.admin, (c) =>
        c.query(
          "INSERT INTO users(email,password_hash,role,created_by) VALUES($1,$2,$3,$4) RETURNING id",
          [`${role}@example.test`, argonHash, role, ids.admin],
        ),
      )
    ).rows[0].id;
  }
  for (const role of ["admin", "accountant", "sales", "construction"] as const) {
    const r = await app.inject({
      method: "POST",
      url: "/api/login",
      headers: { "x-requested-with": "BalochBuilder" },
      payload: { email: `${role}@example.test`, password: "Test-password-123!" },
    });
    expect(r.statusCode, r.body).toBe(200);
    cookies[role] = r.cookies[0].name + "=" + r.cookies[0].value;
  }
  project = (
    await request("admin", "POST", "projects", {
      code: "P1",
      name: "Project one",
      type: "apartments",
      city: "Karachi",
    })
  ).json().id;
  otherProject = (
    await request("admin", "POST", "projects", {
      code: "P2",
      name: "Project two",
      type: "apartments",
      city: "Karachi",
    })
  ).json().id;
  await request("admin", "POST", "assignments", { projectId: project, userId: ids.construction });
  for (const a of (await request("accountant", "GET", "accounts")).json()) account[a.code] = a.id;
  const period = await request("accountant", "POST", "periods", { month: "2026-10-01" });
  expect(period.statusCode, period.body).toBe(200);
}, 60000);
const argonHash = await argon2.hash("Test-password-123!");
afterAll(async () => {
  await app.close();
  await pool.end();
  await ownerPool.end();
});
describe("authentication and permissions", () => {
  it("requires sessions and CSRF header", async () => {
    expect((await app.inject({ url: "/api/accounts" })).statusCode).toBe(401);
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/projects",
          headers: { cookie: cookies.admin },
          payload: {},
        })
      ).statusCode,
    ).toBe(403);
  });
  for (const role of ["sales", "construction"] as const)
    it(`${role} cannot read or mutate finance/admin records`, async () => {
      for (const endpoint of [
        "accounts",
        "vouchers",
        "journal",
        "trial-balance",
        "periods",
        "audit",
        "users",
        "assignments",
        "settings",
      ])
        expect((await request(role, "GET", endpoint)).statusCode, endpoint).toBe(403);
      for (const endpoint of [
        "vouchers",
        "periods",
        "accounts",
        "users",
        "projects",
        "assignments",
      ])
        expect((await request(role, "POST", endpoint, {})).statusCode, endpoint).toBe(403);
    });
  it("accountant cannot manage users, projects, settings or approve", async () => {
    for (const endpoint of ["users", "projects", "assignments"])
      expect((await request("accountant", "POST", endpoint, {})).statusCode).toBe(403);
    expect((await request("accountant", "PUT", "settings", {})).statusCode).toBe(403);
    expect(
      (await request("accountant", "POST", `vouchers/${randomUUID()}/approve`, {})).statusCode,
    ).toBe(404);
  });
  it("construction sees only assigned projects, including after revocation", async () => {
    expect(
      (await request("construction", "GET", "projects")).json().map((p: { id: string }) => p.id),
    ).toEqual([project]);
    await request("admin", "POST", "assignments", {
      projectId: project,
      userId: ids.construction,
      active: false,
    });
    expect((await request("construction", "GET", "projects")).json()).toEqual([]);
    expect(otherProject).not.toBe(project);
  });
  it("denies direct financial SQL by operational roles", async () => {
    await expect(
      sql(
        "INSERT INTO vouchers(type,date,created_by) VALUES($1,$2,$3)",
        ["JV", "2026-10-24", ids.sales],
        "sales",
      ),
    ).rejects.toThrow("permission");
  });
  it("prevents removal of the last admin", async () => {
    expect(
      (await request("admin", "PATCH", `users/${ids.admin}`, { role: "sales", active: true }))
        .statusCode,
    ).toBe(400);
  });
});
describe("PostgreSQL ledger invariants", () => {
  it("rejects unbalanced and empty posting through API and SQL", async () => {
    const id = await make(draft("10000", "9999"));
    expect((await request("accountant", "POST", `vouchers/${id}/post`)).statusCode).toBe(409);
    await expect(sql("UPDATE vouchers SET status='posted' WHERE id=$1", [id])).rejects.toThrow(
      "balance",
    );
    await expect(
      sql(
        "INSERT INTO vouchers(type,date,status,created_by) VALUES('JV','2026-10-24','posted',$1)",
        [ids.accountant],
      ),
    ).rejects.toThrow("draft");
  });
  it("rejects negative, two-sided and float amounts", async () => {
    for (const value of ["-1", "1.2", "90071992547409931231231"])
      expect((await request("accountant", "POST", "vouchers", draft(value))).statusCode).toBe(400);
    const d = draft();
    d.lines[0].credit = "5";
    expect((await request("accountant", "POST", "vouchers", d)).statusCode).toBe(400);
  });
  it("posts balanced entries with exact bigint sums and immutable lines", async () => {
    const id = await make(draft("9007199254740993", "9007199254740993"));
    const posted = await request("accountant", "POST", `vouchers/${id}/post`);
    expect(posted.statusCode, posted.body).toBe(200);
    expect(posted.json().number).toBe("JV-2026-000001");
    await expect(
      sql("UPDATE vouchers SET narration=$1 WHERE id=$2", ["tamper", id]),
    ).rejects.toThrow("immutable");
    await expect(
      sql("UPDATE voucher_lines SET debit=debit+1 WHERE voucher_id=$1 AND debit>0", [id]),
    ).rejects.toThrow("draft");
    await expect(sql("DELETE FROM vouchers WHERE id=$1", [id])).rejects.toMatchObject({
      code: "42501",
    });
    await expect(sql("DELETE FROM voucher_lines WHERE voucher_id=$1", [id])).rejects.toMatchObject({
      code: "42501",
    });
    const tb = (await request("accountant", "GET", "trial-balance")).json();
    expect(tb.find((r: { code: string }) => r.code === "1220").debit).toBe("9007199254740993");
    expect(tb.find((r: { code: string }) => r.code === "2000").credit).toBe("9007199254740993");
  });
  it("serializes concurrent posting with gap-free numbering", async () => {
    const a = await make(),
      b = await make();
    const results = await Promise.all(
      [a, b].map((id) => request("accountant", "POST", `vouchers/${id}/post`)),
    );
    expect(results.map((r) => r.statusCode)).toEqual([200, 200]);
    expect(results.map((r) => r.json().number).sort()).toEqual([
      "JV-2026-000002",
      "JV-2026-000003",
    ]);
  });
  it("prevents double posting and moving lines between vouchers", async () => {
    const a = await make(),
      b = await make();
    await request("accountant", "POST", `vouchers/${a}/post`);
    expect((await request("accountant", "POST", `vouchers/${a}/post`)).statusCode).toBe(409);
    await expect(
      sql("UPDATE voucher_lines SET voucher_id=$1 WHERE voucher_id=$2", [b, a]),
    ).rejects.toThrow("identity");
  });
  it("locks drafts, edits and posting at database level", async () => {
    const id = await make();
    await sql("UPDATE fiscal_periods SET locked=true WHERE month='2026-10-01'");
    await expect(
      sql("UPDATE voucher_lines SET narration=$1 WHERE voucher_id=$2", ["edit", id]),
    ).rejects.toThrow("locked");
    expect((await request("accountant", "POST", `vouchers/${id}/post`)).statusCode).toBe(409);
    expect((await request("accountant", "POST", "vouchers", draft())).statusCode).toBe(409);
    await sql("UPDATE fiscal_periods SET locked=false WHERE month='2026-10-01'");
  });
  it("blocks payment types and disguised cash/bank credits pending Phase 2", async () => {
    for (const type of ["BPV", "CPV", "JV"]) {
      const d = draft("100", "100", type);
      d.lines[1].accountId = account["1000"];
      const id = await make(d);
      expect((await request("admin", "POST", `vouchers/${id}/post`)).statusCode).toBe(409);
      await expect(sql("UPDATE vouchers SET status='posted' WHERE id=$1", [id])).rejects.toThrow(
        "approval",
      );
    }
  });
  it("creates linked reversing drafts and prevents duplicate reversals", async () => {
    const id = await make();
    await request("accountant", "POST", `vouchers/${id}/post`);
    const r = await request("accountant", "POST", `vouchers/${id}/reverse`, {
      date: "2026-10-25",
      narration: "Correct coding",
    });
    expect(r.statusCode, r.body).toBe(200);
    const reversal = (await request("accountant", "GET", `vouchers/${r.json().id}`)).json();
    expect(reversal.reverses_id).toBe(id);
    expect((await request("accountant", "POST", `vouchers/${reversal.id}/post`)).statusCode).toBe(
      200,
    );
    expect(
      (
        await request("accountant", "POST", `vouchers/${id}/reverse`, {
          date: "2026-10-25",
          narration: "Duplicate",
        })
      ).statusCode,
    ).toBe(409);
  });
  it("rejects accounting hierarchy cycles and cash reclassification", async () => {
    await expect(
      sql("UPDATE accounts SET parent_id=id WHERE id=$1", [account["1220"]]),
    ).rejects.toThrow();
    await expect(
      sql("UPDATE accounts SET is_cash_bank=false WHERE id=$1", [account["1000"]]),
    ).rejects.toThrow("classification");
  });
  it("audit is append-only and excludes password hashes and secrets", async () => {
    await expect(ownerPool.query("UPDATE audit_log SET action='changed'")).rejects.toThrow(
      "append-only",
    );
    await expect(ownerPool.query("DELETE FROM audit_log")).rejects.toThrow("append-only");
    await expect(ownerPool.query("TRUNCATE audit_log")).rejects.toThrow("append-only");
    const logs = (await request("admin", "GET", "audit")).json();
    expect(JSON.stringify(logs)).not.toContain("password_hash");
    expect(logs.some((l: { action: string }) => l.action === "permission_denied")).toBe(true);
  });
  it("filters journal and Trial Balance by project and date", async () => {
    expect(
      (await request("accountant", "GET", `journal?projectId=${otherProject}`)).json(),
    ).toEqual([]);
    const tb = (await request("accountant", "GET", "trial-balance?to=2026-09-30")).json();
    expect(
      tb.every((r: { debit: string; credit: string }) => r.debit === "0" && r.credit === "0"),
    ).toBe(true);
  });
});

it("requires optional TOTP and rejects code replay", async () => {
  process.env.TOTP_ENCRYPTION_KEY = "11".repeat(32);
  const { TOTP, Secret } = await import("otpauth");
  const enrolled = await request("admin", "POST", "totp/enroll", {
    password: "Test-password-123!",
  });
  expect(enrolled.statusCode, enrolled.body).toBe(200);
  const secret = enrolled.json().secret;
  const t = new TOTP({ secret: Secret.fromBase32(secret) });
  expect((await request("admin", "POST", "totp/confirm", { token: t.generate() })).statusCode).toBe(
    200,
  );
  const second = await buildApp();
  try {
    const login = (totp?: string) =>
      second.inject({
        method: "POST",
        url: "/api/login",
        headers: { "x-requested-with": "BalochBuilder" },
        payload: {
          email: "admin@example.test",
          password: "Test-password-123!",
          ...(totp ? { totp } : {}),
        },
      });
    expect((await login()).statusCode).toBe(401);
    const code = t.generate({ timestamp: Date.now() + 30000 });
    expect((await login(code)).statusCode).toBe(200);
    expect((await login(code)).statusCode).toBe(401);
    expect(
      (await pool.query("SELECT totp_secret FROM users WHERE id=$1", [ids.admin])).rows[0]
        .totp_secret,
    ).not.toContain(secret);
  } finally {
    await second.close();
  }
});
it("rate limits failed login attempts", async () => {
  const second = await buildApp();
  try {
    for (let i = 0; i < 5; i++)
      expect(
        (
          await second.inject({
            method: "POST",
            url: "/api/login",
            headers: { "x-requested-with": "BalochBuilder" },
            payload: { email: "missing@example.test", password: "bad" },
          })
        ).statusCode,
      ).toBe(401);
    expect(
      (
        await second.inject({
          method: "POST",
          url: "/api/login",
          headers: { "x-requested-with": "BalochBuilder" },
          payload: { email: "missing@example.test", password: "bad" },
        })
      ).statusCode,
    ).toBe(429);
  } finally {
    await second.close();
  }
});
it("stores attachments on drafts and blocks posted changes", async () => {
  const id = await make();
  const result = await request("accountant", "POST", `vouchers/${id}/attachments`, {
    filename: "note.txt",
    contentType: "text/plain",
    base64: Buffer.from("Test attachment").toString("base64"),
  });
  expect(result.statusCode, result.body).toBe(200);
  expect((await request("sales", "GET", `attachments/${result.json().id}`)).statusCode).toBe(403);
  const download = await request("accountant", "GET", `attachments/${result.json().id}`);
  expect(download.body).toBe("Test attachment");
  await request("accountant", "POST", `vouchers/${id}/post`);
  expect(
    (
      await request("accountant", "POST", `vouchers/${id}/attachments`, {
        filename: "late.txt",
        contentType: "text/plain",
        base64: "dGVzdA==",
      })
    ).statusCode,
  ).toBe(400);
  await expect(
    sql("UPDATE attachments SET filename=$1 WHERE id=$2", ["tamper", result.json().id]),
  ).rejects.toMatchObject({ code: "42501" });
});
it("rejects altered reversing amounts even when balanced", async () => {
  const id = await make();
  await request("accountant", "POST", `vouchers/${id}/post`);
  const reversed = await request("accountant", "POST", `vouchers/${id}/reverse`, {
    date: "2026-10-25",
    narration: "Reversal",
  });
  const rid = reversed.json().id;
  await sql("UPDATE voucher_lines SET debit=debit*2,credit=credit*2 WHERE voucher_id=$1", [rid]);
  expect((await request("accountant", "POST", `vouchers/${rid}/post`)).statusCode).toBe(409);
});
it("saves user views privately and audits their changes", async () => {
  await request("admin", "PUT", "views/projects", {
    columns: [],
    filters: { code: { filter: "P1" } },
  });
  expect((await request("accountant", "GET", "views/projects")).json()).toBeNull();
  expect((await request("admin", "GET", "views/projects")).json().filters.code.filter).toBe("P1");
});

describe("runtime database privileges", () => {
  it.each([
    "TRUNCATE voucher_lines",
    "UPDATE audit_log SET action='changed'",
    "DELETE FROM audit_log",
    "ALTER TABLE vouchers DISABLE TRIGGER ALL",
    "DROP TABLE saved_views",
    "CREATE ROLE privilege_escalation_probe",
    "CREATE TABLE public.unauthorized_table(id integer)",
  ])("denies %s", deniedRuntimeStatement);
  it("grants only intended defaults to future business tables", verifyFutureTable);
});

// Registered here so all security cases share the disposable suite database lifecycle.
registerLoginSecurityTests();

registerSessionTests();
