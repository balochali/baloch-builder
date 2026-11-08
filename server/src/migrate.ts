import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import pg from "pg";
// Never fall back to the runtime credentials for DDL.
export const ownerPool = new pg.Pool({
  connectionString: process.env.OWNER_DATABASE_URL,
  connectionTimeoutMillis: 5000,
});
export async function migrate() {
  if (!process.env.OWNER_DATABASE_URL)
    throw new Error("OWNER_DATABASE_URL is required for migrations");
  const c = await ownerPool.connect();
  try {
    const identity = await c.query("SELECT current_user");
    if (identity.rows[0].current_user !== "baloch_owner")
      throw new Error("Migrations require baloch_owner; run scripts/init-database.mjs first");
    await c.query("SELECT pg_advisory_lock(782104)");
    await c.query(
      "CREATE TABLE IF NOT EXISTS schema_migrations(name text PRIMARY KEY,checksum text NOT NULL,applied_at timestamptz NOT NULL DEFAULT now())",
    );
    const dir = fileURLToPath(new URL("../migrations/", import.meta.url));
    for (const name of (await readdir(dir)).filter((n) => n.endsWith(".sql")).sort()) {
      const sql = await readFile(`${dir}/${name}`, "utf8");
      const checksum = createHash("sha256").update(sql).digest("hex");
      const existing = await c.query("SELECT checksum FROM schema_migrations WHERE name=$1", [
        name,
      ]);
      if (existing.rowCount) {
        if (existing.rows[0].checksum !== checksum) throw new Error(`Migration modified: ${name}`);
        continue;
      }
      await c.query("BEGIN");
      try {
        await c.query(sql);
        await c.query("INSERT INTO schema_migrations(name,checksum) VALUES($1,$2)", [
          name,
          checksum,
        ]);
        await c.query("COMMIT");
      } catch (e) {
        await c.query("ROLLBACK");
        throw e;
      }
    }
  } finally {
    await c.query("SELECT pg_advisory_unlock(782104)");
    c.release();
  }
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    await migrate();
  } finally {
    await ownerPool.end();
  }
}
