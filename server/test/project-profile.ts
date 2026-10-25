import { describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import type { Role } from "@baloch/shared";
import { pool, transaction } from "../src/db";
import { ownerPool } from "../src/migrate";
import { seed } from "../src/seed";
import { deniedRuntimeStatement } from "./runtime-privileges";

export async function referenceSnapshot() {
  const result: Record<string, unknown> = {};
  for (const table of ["users", "accounts", "settings", "cost_heads", "audit_log"]) {
    result[table] = (
      await pool.query(
        "SELECT to_jsonb(t) AS value FROM " + table + " t ORDER BY to_jsonb(t)::text",
      )
    ).rows;
  }
  return result;
}
export function registerProjectProfileTests(
  app: FastifyInstance,
  ids: Record<Role, string>,
  cookies: Record<Role, string>,
  accounts: Record<string, string>,
  seedProof: { before?: unknown; after?: unknown },
) {
  const request = (
    role: Role,
    method: "GET" | "POST" | "PATCH" | "DELETE",
    path: string,
    payload?: unknown,
  ) =>
    app.inject({
      method,
      url: "/api/" + path,
      headers: { cookie: cookies[role], "x-requested-with": "BalochBuilder" },
      payload: payload as Record<string, unknown>,
    });
  let sequence = 0;
  async function project() {
    const r = await request("admin", "POST", "projects", {
      code: "T2-" + ++sequence,
      name: "Task two",
      type: "apartments",
      city: "Karachi",
    });
    expect(r.statusCode, r.body).toBe(200);
    return r.json().id as string;
  }
  async function head(extra: Record<string, unknown> = {}, role: Role = "accountant") {
    const r = await request(role, "POST", "cost-heads", {
      code: "TEST-" + ++sequence,
      name: "Testing cost",
      ...extra,
    });
    expect(r.statusCode, r.body).toBe(200);
    return r.json().id as string;
  }
  function voucher(projectId: string, costHeadId: string | null, code = "1220") {
    return {
      date: "2026-10-24",
      type: "JV",
      narration: "Task 2",
      lines: [
        {
          accountId: accounts[code],
          projectId,
          costHeadId,
          debit: "10000",
          credit: "0",
          narration: "Cost",
        },
        {
          accountId: accounts["2000"],
          projectId,
          debit: "0",
          credit: "10000",
          narration: "Payable",
        },
      ],
    };
  }
  async function draft(projectId: string, costHeadId: string | null, code = "1220") {
    const r = await request("accountant", "POST", "vouchers", voucher(projectId, costHeadId, code));
    expect(r.statusCode, r.body).toBe(200);
    return r.json().id as string;
  }
  const sql = (statement: string, params: unknown[] = [], role: Role = "admin") =>
    transaction(ids[role], (c) => c.query(statement, params));
  describe("Task 2 profiles and assignments", () => {
    it("seeds twice on a fresh database with byte-equivalent rows including audit", () => {
      expect(seedProof.before).toBeDefined();
      expect(seedProof.after).toEqual(seedProof.before);
    });
    it("preserves edited system head values and codes when reference seed repeats", async () => {
      const id = (await pool.query("SELECT id FROM cost_heads WHERE seed_key='DESIGN'")).rows[0].id;
      expect(
        (
          await request("accountant", "PATCH", "cost-heads/" + id, {
            name: "Regional design",
            code: "LOCAL-DESIGN",
            active: false,
          })
        ).statusCode,
      ).toBe(200);
      const before = await referenceSnapshot();
      await seed("admin@example.test", "Test-password-123!");
      expect(await referenceSnapshot()).toEqual(before);
      expect(
        (await pool.query("SELECT count(*)::int AS n FROM cost_heads WHERE seed_key='DESIGN'"))
          .rows[0].n,
      ).toBe(1);
    });
    for (const role of ["admin", "accountant", "sales", "construction"] as const) {
      it(role + " has the intended create/edit/archive permissions", async () => {
        const p = await project();
        if (role === "sales" || role === "construction")
          await request("admin", "POST", "assignments", { projectId: p, userId: ids[role] });
        expect(
          (
            await request(role, "POST", "projects", {
              code: "ROLE-" + ++sequence,
              name: "Role",
              city: "Karachi",
              type: "plots",
            })
          ).statusCode,
        ).toBe(role === "admin" ? 200 : 403);
        expect((await request(role, "PATCH", "projects/" + p, { city: "Lahore" })).statusCode).toBe(
          role === "admin" ? 200 : 403,
        );
        expect(
          (await request(role, "PATCH", "projects/" + p, { cost_allocation_method: "sale_value" }))
            .statusCode,
        ).toBe(role === "admin" || role === "accountant" ? 200 : 403);
        expect(
          (await request(role, "POST", "projects/" + p + "/archive", { archived: true }))
            .statusCode,
        ).toBe(role === "admin" ? 200 : 403);
      });
    }
    for (const role of ["sales", "construction"] as const)
      it(role + " loses all project reads on the next request after removal", async () => {
        const p = await project();
        expect((await request(role, "GET", "projects/" + p)).statusCode).toBe(403);
        expect(
          (await request("admin", "POST", "assignments", { projectId: p, userId: ids[role] }))
            .statusCode,
        ).toBe(200);
        expect((await request(role, "GET", "projects/" + p)).statusCode).toBe(200);
        expect(
          (await request(role, "GET", "projects")).json().some((x: { id: string }) => x.id === p),
        ).toBe(true);
        await request("admin", "POST", "assignments", {
          projectId: p,
          userId: ids[role],
          active: false,
        });
        for (const suffix of ["", "/buildings", "/assignments", "/status-history"])
          expect((await request(role, "GET", "projects/" + p + suffix)).statusCode).toBe(403);
        expect(
          (await request(role, "GET", "projects")).json().some((x: { id: string }) => x.id === p),
        ).toBe(false);
        expect(
          (
            await pool.query(
              "SELECT 1 FROM audit_log WHERE actor_id=$1 AND action='permission_denied'",
              [ids[role]],
            )
          ).rowCount,
        ).toBeGreaterThan(0);
      });
    it("rejects inactive users as assignments and project managers", async () => {
      const p = await project();
      await sql("UPDATE users SET active=false WHERE id=$1", [ids.sales]);
      try {
        expect(
          (await request("admin", "POST", "assignments", { projectId: p, userId: ids.sales }))
            .statusCode,
        ).toBe(409);
        expect(
          (await request("admin", "PATCH", "projects/" + p, { project_manager_id: ids.sales }))
            .statusCode,
        ).toBe(409);
      } finally {
        await sql("UPDATE users SET active=true WHERE id=$1", [ids.sales]);
      }
    });
    it("records forward and reasoned backward transitions and rejects closed", async () => {
      const p = await project();
      expect(
        (await request("admin", "POST", "projects/" + p + "/status", { status: "construction" }))
          .statusCode,
      ).toBe(200);
      expect(
        (await request("admin", "POST", "projects/" + p + "/status", { status: "planning" }))
          .statusCode,
      ).toBe(400);
      await expect(sql("UPDATE projects SET status='planning' WHERE id=$1", [p])).rejects.toThrow(
        /reason/i,
      );
      expect(
        (
          await request("admin", "POST", "projects/" + p + "/status", {
            status: "planning",
            reason: "Permit revision",
          })
        ).statusCode,
      ).toBe(200);
      expect(
        (await request("admin", "POST", "projects/" + p + "/status", { status: "closed" }))
          .statusCode,
      ).toBe(400);
      await expect(sql("UPDATE projects SET status='closed' WHERE id=$1", [p])).rejects.toThrow(
        /reserved/i,
      );
      const history = (await request("admin", "GET", "projects/" + p + "/status-history")).json();
      expect(history.map((h: { to_status: string }) => h.to_status)).toEqual([
        "planning",
        "construction",
        "planning",
      ]);
      expect(history[2]).toMatchObject({
        from_status: "construction",
        reason: "Permit revision",
        changed_by: ids.admin,
      });
    });
    it("enforces case-insensitive project codes and freezes them after a draft line", async () => {
      const p = await project();
      const code = (await request("admin", "GET", "projects/" + p)).json().code;
      expect(
        (
          await request("admin", "POST", "projects", {
            code: code.toLowerCase(),
            name: "Duplicate",
            city: "Karachi",
            type: "plots",
          })
        ).statusCode,
      ).toBe(409);
      await draft(p, await head());
      expect(
        (await request("admin", "PATCH", "projects/" + p, { code: "CHANGED" })).statusCode,
      ).toBe(409);
      await expect(sql("UPDATE projects SET code='CHANGED' WHERE id=$1", [p])).rejects.toThrow(
        /code/i,
      );
    });
    it("blocks drafts and posting on archived projects and restores access on unarchive", async () => {
      const p = await project(),
        h = await head(),
        v = await draft(p, h);
      expect(
        (await request("admin", "POST", "projects/" + p + "/archive", { archived: true })).json()
          .archived_at,
      ).toBeTruthy();
      expect((await request("accountant", "POST", "vouchers", voucher(p, h))).statusCode).toBe(409);
      expect((await request("accountant", "POST", "vouchers/" + v + "/post")).statusCode).toBe(409);
      await expect(
        sql("UPDATE vouchers SET status='posted' WHERE id=$1", [v], "accountant"),
      ).rejects.toThrow(/archived/i);
      expect(
        (await request("admin", "GET", "projects")).json().some((x: { id: string }) => x.id === p),
      ).toBe(false);
      expect(
        (await request("admin", "GET", "projects?includeArchived=true"))
          .json()
          .some((x: { id: string }) => x.id === p),
      ).toBe(true);
      expect(
        (await request("admin", "POST", "projects/" + p + "/archive", { archived: false })).json()
          .archived_at,
      ).toBeNull();
      expect((await request("accountant", "POST", "vouchers/" + v + "/post")).statusCode).toBe(200);
    });
    it("validates merged profile areas and dates without rewriting unrelated values", async () => {
      const p = await project();
      expect(
        (
          await request("admin", "PATCH", "projects/" + p, {
            covered_area_sqft: "10.000000000000000000000001",
            saleable_area_sqft: "10",
            start_date: "2026-10-24",
          })
        ).statusCode,
      ).toBe(200);
      expect(
        (await request("admin", "PATCH", "projects/" + p, { saleable_area_sqft: "11" })).statusCode,
      ).toBe(400);
      expect(
        (await request("admin", "PATCH", "projects/" + p, { planned_end_date: "2026-10-23" }))
          .statusCode,
      ).toBe(400);
      expect((await request("admin", "GET", "projects/" + p)).json().covered_area_sqft).toBe(
        "10.000000000000000000000001",
      );
    });
    it("audits project, building, head and assignment old/new values and restricts referenced building removal", async () => {
      const p = await project(),
        h = await head();
      await request("admin", "PATCH", "projects/" + p, { city: "Lahore" });
      const b = await request("admin", "POST", "projects/" + p + "/buildings", {
        name: "Tower A",
        floors: 5,
      });
      expect(b.statusCode, b.body).toBe(200);
      const bid = b.json().id as string;
      expect(
        (
          await request("admin", "POST", "projects/" + p + "/buildings", {
            name: "tower a",
            floors: 1,
          })
        ).statusCode,
      ).toBe(409);
      expect(
        (
          await request("admin", "PATCH", "projects/" + p + "/buildings/" + bid, {
            name: "Tower B",
            floors: 6,
          })
        ).statusCode,
      ).toBe(200);
      await request("accountant", "PATCH", "cost-heads/" + h, { name: "Renamed cost" });
      const a = await request("admin", "POST", "assignments", {
        projectId: p,
        userId: ids.construction,
      });
      expect(a.statusCode).toBe(200);
      await request("admin", "POST", "assignments", {
        projectId: p,
        userId: ids.construction,
        active: false,
      });
      for (const [entity, entityId, field, oldValue, newValue] of [
        ["projects", p, "city", "Karachi", "Lahore"],
        ["project_buildings", bid, "name", "Tower A", "Tower B"],
        ["cost_heads", h, "name", "Testing cost", "Renamed cost"],
      ]) {
        const rows = (
          await pool.query(
            "SELECT old_value,new_value FROM audit_log WHERE entity=$1 AND entity_id=$2 AND old_value IS NOT NULL",
            [entity, entityId],
          )
        ).rows;
        expect(
          rows.some((r) => r.old_value[field] === oldValue && r.new_value[field] === newValue),
        ).toBe(true);
      }
      expect(
        (
          await pool.query(
            "SELECT 1 FROM audit_log WHERE entity='project_assignments' AND old_value->>'project_id'=$1 AND old_value->>'active'='true' AND new_value->>'active'='false'",
            [p],
          )
        ).rowCount,
      ).toBe(1);
      await ownerPool.query(
        "CREATE TABLE task2_unit_reference(building_id uuid REFERENCES project_buildings(id))",
      );
      try {
        await ownerPool.query("INSERT INTO task2_unit_reference VALUES($1)", [bid]);
        expect(
          (await request("admin", "DELETE", "projects/" + p + "/buildings/" + bid)).statusCode,
        ).toBe(409);
      } finally {
        await ownerPool.query("DROP TABLE task2_unit_reference");
      }
      expect(
        (await request("admin", "DELETE", "projects/" + p + "/buildings/" + bid)).statusCode,
      ).toBe(200);
    });
  });
  describe("Task 2 cost heads and posting", () => {
    for (const role of ["admin", "accountant"] as const)
      it(role + " can manage cost heads", async () => {
        const h = await head({}, role);
        expect(
          (await request(role, "PATCH", "cost-heads/" + h, { name: "Updated", active: false }))
            .statusCode,
        ).toBe(200);
      });
    it("construction reads only active heads and sales cannot read them", async () => {
      const h = await head({ active: false });
      expect(
        (await request("construction", "GET", "cost-heads"))
          .json()
          .some((x: { id: string }) => x.id === h),
      ).toBe(false);
      expect((await request("sales", "GET", "cost-heads")).statusCode).toBe(403);
      for (const role of ["sales", "construction"] as const) {
        expect(
          (await request(role, "POST", "cost-heads", { code: "NO", name: "No" })).statusCode,
        ).toBe(403);
        expect((await request(role, "PATCH", "cost-heads/" + h, { active: true })).statusCode).toBe(
          403,
        );
      }
    });
    it("permits only one child level and rejects cycles", async () => {
      const parent = await head(),
        child = await head({ parent_id: parent });
      expect(
        (
          await request("admin", "POST", "cost-heads", {
            code: "GRAND",
            name: "Grandchild",
            parent_id: child,
          })
        ).statusCode,
      ).toBe(409);
      expect(
        (await request("admin", "PATCH", "cost-heads/" + parent, { parent_id: child })).statusCode,
      ).toBe(409);
      expect(
        (await request("admin", "PATCH", "cost-heads/" + child, { parent_id: child })).statusCode,
      ).toBe(409);
    });
    for (const code of ["1200", "1210", "1220", "1230", "1240"])
      it("database requires a cost head at posting for WIP " + code, async () => {
        const p = await project(),
          v = await draft(p, null, code);
        expect((await request("accountant", "POST", "vouchers/" + v + "/post")).statusCode).toBe(
          409,
        );
        await expect(
          sql("UPDATE vouchers SET status='posted' WHERE id=$1", [v], "accountant"),
        ).rejects.toThrow(/cost head/i);
        const tagged = await draft(p, await head(), code);
        expect(
          (await request("accountant", "POST", "vouchers/" + tagged + "/post")).statusCode,
        ).toBe(200);
      });
    it("freezes used head codes, preserves posted tags, and blocks inactive/budget tags", async () => {
      const p = await project(),
        h = await head({ default_account_id: accounts["1230"] });
      const posted = await draft(p, h, "1220"); // Default is only a suggestion; another account is legal.
      expect((await request("accountant", "POST", "vouchers/" + posted + "/post")).statusCode).toBe(
        200,
      );
      const pending = await draft(p, h);
      expect(
        (await request("accountant", "PATCH", "cost-heads/" + h, { code: "RECODED" })).statusCode,
      ).toBe(409);
      expect(
        (await request("accountant", "PATCH", "cost-heads/" + h, { active: false })).statusCode,
      ).toBe(200);
      expect((await request("accountant", "POST", "vouchers", voucher(p, h))).statusCode).toBe(409);
      expect(
        (await request("accountant", "POST", "vouchers/" + pending + "/post")).statusCode,
      ).toBe(409);
      expect(
        (
          await pool.query(
            "SELECT cost_head_id FROM voucher_lines WHERE voucher_id=$1 AND cost_head_id IS NOT NULL",
            [posted],
          )
        ).rows[0].cost_head_id,
      ).toBe(h);
      const budget = await head({ budget_only: true });
      expect((await request("accountant", "POST", "vouchers", voucher(p, budget))).statusCode).toBe(
        409,
      );
      await request("accountant", "PATCH", "cost-heads/" + h, { active: true, budget_only: true });
      await expect(
        sql("UPDATE vouchers SET status='posted' WHERE id=$1", [pending], "accountant"),
      ).rejects.toThrow(/cost head/i);
    });
    it("rejects head deletion even by the migration owner", async () => {
      await deniedRuntimeStatement("DELETE FROM cost_heads");
      await expect(ownerPool.query("DELETE FROM cost_heads")).rejects.toThrow(/delet/i);
    });
    for (const table of ["project_buildings", "project_status_history", "cost_heads"]) {
      it("restricts app-role DDL/TRUNCATE on " + table, async () => {
        for (const statement of [
          "TRUNCATE " + table + " CASCADE",
          "ALTER TABLE " + table + " DISABLE TRIGGER ALL",
          "DROP TABLE " + table + " CASCADE",
        ])
          await deniedRuntimeStatement(statement);
      });
    }
    it("keeps status history append-only for app and owner", async () => {
      await deniedRuntimeStatement("UPDATE project_status_history SET reason='tampered'");
      await deniedRuntimeStatement("DELETE FROM project_status_history");
      await expect(
        ownerPool.query("UPDATE project_status_history SET reason='tampered'"),
      ).rejects.toThrow(/append.only/i);
      await expect(ownerPool.query("DELETE FROM project_status_history")).rejects.toThrow(
        /append.only/i,
      );
    });
  });
}
