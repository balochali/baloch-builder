import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 5000,
});
export const db = drizzle(pool);
export async function assertRuntimeRole() {
  const { rows } =
    await pool.query(`SELECT r.rolname, r.rolsuper, r.rolcreatedb, r.rolcreaterole, r.rolbypassrls,
    EXISTS(SELECT 1 FROM pg_class WHERE relowner=r.oid AND relnamespace='public'::regnamespace) AS owns_tables,
    EXISTS(SELECT 1 FROM pg_proc WHERE proowner=r.oid AND pronamespace='public'::regnamespace) AS owns_functions,
    EXISTS(SELECT 1 FROM pg_auth_members WHERE member=r.oid) AS has_membership
    FROM pg_roles r WHERE rolname=current_user`);
  const r = rows[0];
  if (
    !r ||
    r.rolname !== "baloch_app" ||
    r.rolsuper ||
    r.rolcreatedb ||
    r.rolcreaterole ||
    r.rolbypassrls ||
    r.owns_tables ||
    r.owns_functions ||
    r.has_membership
  )
    throw new Error("DATABASE_URL must use the limited, non-owner baloch_app role");
}
export async function transaction<T>(
  actor: string | null,
  fn: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    await c.query("SELECT set_config('app.actor_id',$1,true)", [actor ?? ""]);
    const result = await fn(c);
    await c.query("COMMIT");
    return result;
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}
export async function audit(
  actor: string | null,
  action: string,
  entity: string,
  id: string | null = null,
  value: unknown = null,
) {
  await pool.query(
    "INSERT INTO audit_log(actor_id,action,entity,entity_id,new_value) VALUES($1,$2,$3,$4,$5)",
    [actor, action, entity, id, value],
  );
}
