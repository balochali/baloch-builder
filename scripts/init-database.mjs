// Administrator-only provisioning for a dedicated Baloch database. Repeatable.
import pg from "pg";
const { ADMIN_DATABASE_URL, OWNER_PASSWORD, APP_PASSWORD } = process.env;
if (!ADMIN_DATABASE_URL || !OWNER_PASSWORD || !APP_PASSWORD)
  throw new Error("Set ADMIN_DATABASE_URL, OWNER_PASSWORD and APP_PASSWORD");
if (OWNER_PASSWORD === APP_PASSWORD) throw new Error("Owner and app passwords must differ");
const c = new pg.Client({ connectionString: ADMIN_DATABASE_URL, connectionTimeoutMillis: 5000 });
const ident = (s) => '"' + s.replaceAll('"', '""') + '"';
await c.connect();
try {
  await c.query("BEGIN");
  await c.query("SELECT pg_advisory_xact_lock(782107)");
  for (const [role, password] of [
    ["baloch_owner", OWNER_PASSWORD],
    ["baloch_app", APP_PASSWORD],
  ]) {
    if (!(await c.query("SELECT 1 FROM pg_roles WHERE rolname=$1", [role])).rowCount)
      await c.query(`CREATE ROLE ${ident(role)}`);
    const literal = (await c.query("SELECT quote_literal($1::text) AS value", [password])).rows[0]
      .value;
    await c.query(
      `ALTER ROLE ${ident(role)} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD ${literal}`,
    );
    if (
      (
        await c.query(
          "SELECT 1 FROM pg_auth_members m JOIN pg_roles r ON r.oid=m.member WHERE r.rolname=$1",
          [role],
        )
      ).rowCount
    )
      throw new Error(`${role} must have no inherited role memberships`);
  }
  const database = (await c.query("SELECT current_database() AS name")).rows[0].name;
  await c.query(`ALTER DATABASE ${ident(database)} OWNER TO baloch_owner`);
  await c.query(`REVOKE ALL ON DATABASE ${ident(database)} FROM PUBLIC`);
  await c.query(`GRANT CONNECT ON DATABASE ${ident(database)} TO baloch_app`);
  await c.query("ALTER SCHEMA public OWNER TO baloch_owner");
  await c.query("REVOKE ALL ON SCHEMA public FROM PUBLIC");
  // Existing Phase 1 installations require an explicit ownership adoption.
  if (process.argv.includes("--adopt-existing")) {
    const tables = await c.query(
      "SELECT relname, relkind FROM pg_class WHERE relnamespace='public'::regnamespace AND relkind IN ('r','p','S','v','m')",
    );
    for (const t of tables.rows) {
      const kind = { r: "TABLE", p: "TABLE", S: "SEQUENCE", v: "VIEW", m: "MATERIALIZED VIEW" }[
        t.relkind
      ];
      await c.query(`ALTER ${kind} public.${ident(t.relname)} OWNER TO baloch_owner`);
    }
    const functions = await c.query(
      "SELECT p.oid::regprocedure::text AS signature FROM pg_proc p WHERE pronamespace='public'::regnamespace AND NOT EXISTS (SELECT 1 FROM pg_depend WHERE classid='pg_proc'::regclass AND objid=p.oid AND deptype='e')",
    );
    for (const f of functions.rows)
      await c.query(`ALTER FUNCTION ${f.signature} OWNER TO baloch_owner`);
  }
  await c.query("COMMIT");
  console.log(
    "Database roles provisioned. Run migrations with OWNER_DATABASE_URL; runtime uses DATABASE_URL.",
  );
} catch (error) {
  await c.query("ROLLBACK");
  throw error;
} finally {
  await c.end();
}
