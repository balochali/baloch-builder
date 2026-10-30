import { describe, it, expect } from "vitest";
import type { FastifyInstance } from "fastify";
import type { Role } from "@baloch/shared";
import { pool, transaction } from "../src/db";
export function registerWorkbookTests(
  app: FastifyInstance,
  ids: Record<Role, string>,
  cookies: Record<Role, string>,
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
  let seq = 0;
  const project = async () => {
    const result = await request("admin", "POST", "projects", {
      code: "WB-" + ++seq,
      name: "Workbook Test",
      city: "Karachi",
      type: "apartments",
    });
    expect(result.statusCode, result.body).toBe(200);
    return result.json().id as string;
  };
  describe("project workbook persistence", () => {
    it.each([
      ["partners", { name: "Ali", share: "35", agreed: "1000", received: "600", paid: "50" }],
      [
        "construction",
        {
          item: "Foundation",
          contractor: "Contractor",
          agreed: "1000",
          paid: "400",
          stage: "In Progress",
        },
      ],
      ["estimate", { item: "Concrete", quantity: "2.5", rate: "100.25", unit: "yards" }],
      [
        "flats",
        {
          number: "A-01",
          floor: 1,
          rooms: 3,
          area: "900",
          status: "Sold",
          buyer: "Buyer",
          seller: "Builder",
          price: "200000",
          received: "50000",
        },
      ],
    ])("persists and reloads %s without posting ledger entries", async (sheet, data) => {
      const id = await project();
      const path = `projects/${id}/workbook/${sheet}`;
      const result = await request("admin", "POST", path, data);
      expect(result.statusCode, result.body).toBe(200);
      const fetched = await request("accountant", "GET", path);
      expect(fetched.statusCode).toBe(200);
      expect(fetched.json()[0]).toMatchObject(data);
      expect(
        (await pool.query("SELECT count(*)::int AS n FROM voucher_lines WHERE project_id=$1", [id]))
          .rows[0].n,
      ).toBe(0);
      expect(
        (
          await pool.query("SELECT count(*)::int AS n FROM audit_log WHERE entity_id=$1", [
            result.json().id,
          ])
        ).rows[0].n,
      ).toBeGreaterThan(0);
    });
    it("removes estimates with version checks, authorization and retained audit history", async () => {
      const id = await project(),
        other = await project(),
        path = `projects/${id}/workbook/estimate`;
      const row = (
        await request("admin", "POST", path, {
          item: "Remove me",
          minimumCost: "10",
          maximumCost: "20",
        })
      ).json();
      expect(
        (await request("accountant", "DELETE", path + "/" + row.id, { version: row.version }))
          .statusCode,
      ).toBe(403);
      expect(
        (
          await request("admin", "DELETE", `projects/${other}/workbook/estimate/${row.id}`, {
            version: row.version,
          })
        ).statusCode,
      ).toBe(409);
      expect(
        (await request("admin", "DELETE", path + "/" + row.id, { version: row.version + 1 }))
          .statusCode,
      ).toBe(409);
      expect(
        (await request("admin", "DELETE", path + "/" + row.id, { version: row.version }))
          .statusCode,
      ).toBe(200);
      expect((await request("admin", "GET", path)).json()).toEqual([]);
      expect(
        (await pool.query("SELECT removed,data FROM project_workbook_rows WHERE id=$1", [row.id]))
          .rows[0],
      ).toMatchObject({ removed: true, data: { item: "Remove me" } });
      expect(
        (await pool.query("SELECT count(*)::int AS n FROM audit_log WHERE entity_id=$1", [row.id]))
          .rows[0].n,
      ).toBe(2);
      expect(
        (
          await request("admin", "PATCH", path + "/" + row.id, {
            version: row.version + 1,
            data: { item: "Changed" },
          })
        ).statusCode,
      ).toBe(409);
    });
    it("rejects stale edits and edits addressed to another project", async () => {
      const id = await project(),
        other = await project(),
        path = `projects/${id}/workbook/estimate`;
      const first = (
        await request("admin", "POST", path, { item: "Steel", quantity: "1", rate: "10" })
      ).json();
      const body = { version: first.version, data: { item: "Steel", quantity: "2", rate: "10" } };
      expect((await request("admin", "PATCH", path + "/" + first.id, body)).statusCode).toBe(200);
      expect((await request("admin", "PATCH", path + "/" + first.id, body)).statusCode).toBe(409);
      expect(
        (
          await request("admin", "PATCH", `projects/${other}/workbook/estimate/${first.id}`, {
            ...body,
            version: 2,
          })
        ).statusCode,
      ).toBe(409);
    });
    it("prevents excess partner shares, duplicate flat numbers and sold flats without buyers", async () => {
      const id = await project(),
        path = `projects/${id}/workbook/`;
      expect(
        (await request("admin", "POST", path + "partners", { name: "A", share: "70" })).statusCode,
      ).toBe(200);
      expect(
        (await request("admin", "POST", path + "partners", { name: "B", share: "40" })).statusCode,
      ).toBeGreaterThanOrEqual(400);
      expect((await request("admin", "POST", path + "flats", { number: "F1" })).statusCode).toBe(
        200,
      );
      expect(
        (await request("admin", "POST", path + "flats", { number: "f1" })).statusCode,
      ).toBeGreaterThanOrEqual(400);
      expect(
        (await request("admin", "POST", path + "flats", { number: "F2", status: "Sold" }))
          .statusCode,
      ).toBe(400);
    });
    it("enforces assignment reads and administrator writes including direct SQL", async () => {
      const id = await project(),
        path = `projects/${id}/workbook/partners`;
      expect((await request("construction", "GET", path)).statusCode).toBe(403);
      expect((await request("accountant", "POST", path, { name: "Denied" })).statusCode).toBe(403);
      await expect(
        transaction(ids.accountant, (c) =>
          c.query(
            "INSERT INTO project_workbook_rows(project_id,sheet,data,created_by) VALUES($1,'partners',$2,$3)",
            [id, JSON.stringify({ name: "Denied", share: "0" }), ids.accountant],
          ),
        ),
      ).rejects.toThrow();
      await request("admin", "POST", "assignments", { projectId: id, userId: ids.construction });
      expect((await request("construction", "GET", path)).statusCode).toBe(200);
    });
  });
}
