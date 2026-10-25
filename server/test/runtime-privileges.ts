import { expect } from "vitest";
import { pool } from "../src/db";
import { ownerPool } from "../src/migrate";

export async function deniedRuntimeStatement(statement: string) {
  // Roll back even if the security regression lets a destructive command succeed.
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    await expect(c.query(statement)).rejects.toMatchObject({ code: "42501" });
  } finally {
    await c.query("ROLLBACK");
    c.release();
  }
}

export async function verifyFutureTable() {
  const c = await ownerPool.connect();
  try {
    await c.query("CREATE TABLE public.future_privilege_probe(id integer PRIMARY KEY, value text)");
    await pool.query("INSERT INTO future_privilege_probe VALUES(1,'first')");
    await pool.query("UPDATE future_privilege_probe SET value='second' WHERE id=1");
    expect((await pool.query("SELECT value FROM future_privilege_probe")).rows).toEqual([
      { value: "second" },
    ]);
    const denied = await pool.query(
      "SELECT has_table_privilege(current_user,'future_privilege_probe','DELETE') AS delete, has_table_privilege(current_user,'future_privilege_probe','TRUNCATE') AS truncate",
    );
    expect(denied.rows[0]).toEqual({ delete: false, truncate: false });
  } finally {
    await c.query("DROP TABLE IF EXISTS public.future_privilege_probe");
    c.release();
  }
}
