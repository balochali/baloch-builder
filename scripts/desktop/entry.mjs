// Packaged command entry. Secrets arrive through stdin, never command arguments.
import { readFile, readdir, mkdir, writeFile, rename, rm, cp } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import pg from "pg";
import { listBackups, pruneBackups, isNewer } from "./policies.mjs";
const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);
const request = JSON.parse(Buffer.concat(chunks).toString());
Object.assign(process.env, request.env);
const data = process.env.BALOCH_INSTALLED_DATA;
const folder = path.join(data, "backups");
await mkdir(folder, { recursive: true });
const bin = process.env.PG_BIN;
const connect = async (database = "baloch") => {
  const u = new URL(process.env.ADMIN_DATABASE_URL);
  u.pathname = "/" + database;
  const c = new pg.Client({ connectionString: u.href });
  await c.connect();
  return c;
};
function executable(name, args) {
  const r = spawnSync(path.join(bin, name + ".exe"), args, {
    windowsHide: true,
    env: { ...process.env, PGPASSWORD: new URL(process.env.ADMIN_DATABASE_URL).password },
    encoding: "utf8",
  });
  if (r.status) throw Error(name + " failed (see desktop logs)");
  return r.stdout;
}
const auth = () => {
  const u = new URL(process.env.ADMIN_DATABASE_URL);
  return ["-h", "127.0.0.1", "-p", u.port, "-U", "postgres"];
};
async function backup() {
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15);
  const file = "baloch-" + stamp + "-" + (Date.now() % 1000) + ".dump";
  const target = path.join(folder, file);
  executable("pg_dump", [...auth(), "-Fc", "-d", "baloch", "-f", target + ".partial"]);
  executable("pg_restore", ["--list", target + ".partial"]);
  await rename(target + ".partial", target);
  const files = path.join(data, "attachments");
  try {
    await cp(files, target + ".files", { recursive: true });
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }
  await writeFile(target + ".json", JSON.stringify({ version: process.env.APP_VERSION }));
  return file;
}
async function prepare() {
  const admin = await connect("postgres");
  if (
    (
      await admin.query(
        "SELECT 1 FROM pg_database WHERE datname IN ('baloch_previous','baloch_restore')",
      )
    ).rowCount
  ) {
    await admin.end();
    throw Error("Interrupted restore: preserved databases require recovery");
  }
  for (const [role, key] of [
    ["baloch_owner", "OWNER_PASSWORD"],
    ["baloch_app", "APP_PASSWORD"],
  ]) {
    const pw = process.env[key];
    if (!(await admin.query("SELECT 1 FROM pg_roles WHERE rolname=$1", [role])).rowCount)
      await admin.query("CREATE ROLE " + role);
    const literal = (await admin.query("SELECT quote_literal($1::text) value", [pw])).rows[0].value;
    await admin.query(
      "ALTER ROLE " +
        role +
        " LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD " +
        literal,
    );
  }
  if (!(await admin.query("SELECT 1 FROM pg_database WHERE datname='baloch'")).rowCount)
    await admin.query("CREATE DATABASE baloch OWNER baloch_owner");
  await admin.end();
  const c = await connect();
  await c.query("ALTER SCHEMA public OWNER TO baloch_owner");
  await c.query("REVOKE ALL ON SCHEMA public FROM PUBLIC");
  await c.query("REVOKE ALL ON DATABASE baloch FROM PUBLIC");
  await c.query("GRANT CONNECT ON DATABASE baloch TO baloch_app");
  await c.query("ALTER DATABASE baloch SET baloch.installed = 'true'");
  const table = (await c.query("SELECT to_regclass('public.schema_migrations') present")).rows[0]
    .present;
  const applied = table
    ? (await c.query("SELECT name FROM schema_migrations")).rows.map((r) => r.name)
    : [];
  const files = (await readdir(process.env.MIGRATIONS_DIR)).filter((n) => n.endsWith(".sql"));
  if (applied.length && files.some((n) => !applied.includes(n))) await backup();
  await c.end();
  const { migrate, ownerPool } = await import("../../server/src/migrate.ts");
  try {
    await migrate();
  } finally {
    await ownerPool.end();
  }
  const day = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  if (!(await listBackups(folder)).some((b) => b.name.startsWith("baloch-" + day))) await backup();
  await pruneBackups(folder);
}
async function restore(name) {
  if (!(await listBackups(folder)).some((b) => b.name === name))
    throw Error("Select a listed backup");
  try {
    const meta = JSON.parse(await readFile(path.join(folder, name) + ".json", "utf8"));
    if (isNewer(meta.version, process.env.APP_VERSION))
      throw Error("Backup was made by a newer app");
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }
  await backup();
  const candidate = "baloch_restore",
    previous = "baloch_previous";
  const c = await connect("postgres");
  try {
    // Never drop a previous database: a failed earlier restore needs explicit recovery.
    if (
      (await c.query("SELECT 1 FROM pg_database WHERE datname=ANY($1)", [[candidate, previous]]))
        .rowCount
    )
      throw Error("A previous restore needs recovery; databases were preserved");
    await c.query("CREATE DATABASE " + candidate + " OWNER baloch_owner");
    try {
      executable("pg_restore", [
        ...auth(),
        "--exit-on-error",
        "-d",
        candidate,
        path.join(folder, name),
      ]);
      const verify = await connect(candidate);
      const rows = await verify.query("SELECT name FROM schema_migrations");
      const shipped = new Set(
        (await readdir(process.env.MIGRATIONS_DIR)).filter((n) => n.endsWith(".sql")),
      );
      if (rows.rows.some((r) => !shipped.has(r.name))) throw Error("Backup is from a newer app");
      await verify.query("SELECT count(*) FROM users");
      await verify.end();
    } catch (e) {
      await c.query("DROP DATABASE " + candidate + " WITH (FORCE)");
      throw e;
    }
    await c.query(
      "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='baloch' AND pid<>pg_backend_pid()",
    );
    await c.query("ALTER DATABASE baloch RENAME TO " + previous);
    try {
      await c.query("ALTER DATABASE " + candidate + " RENAME TO baloch");
      const u = new URL(process.env.OWNER_DATABASE_URL);
      const { migrate, ownerPool } = await import("../../server/src/migrate.ts");
      try {
        await migrate();
      } finally {
        await ownerPool.end();
      }
      void u;
      await c.query("REVOKE ALL ON DATABASE baloch FROM PUBLIC");
      await c.query("GRANT CONNECT ON DATABASE baloch TO baloch_app");
      await c.query("ALTER DATABASE baloch SET baloch.installed = 'true'");
      const live = path.join(data, "attachments"),
        old = path.join(data, "attachments.previous");
      try {
        await rename(live, old);
      } catch (e) {
        if (e.code !== "ENOENT") throw e;
      }
      try {
        await cp(path.join(folder, name) + ".files", live, { recursive: true });
      } catch (e) {
        if (e.code !== "ENOENT") throw e;
      }
      await c.query("DROP DATABASE " + previous + " WITH (FORCE)");
      await rm(old, { recursive: true, force: true }).catch(() => {});
    } catch (e) {
      await c.query("DROP DATABASE IF EXISTS baloch WITH (FORCE)");
      await c.query("ALTER DATABASE " + previous + " RENAME TO baloch");
      const old = path.join(data, "attachments.previous");
      try {
        await rm(path.join(data, "attachments"), { recursive: true, force: true });
        await rename(old, path.join(data, "attachments"));
      } catch {}
      throw e;
    }
  } finally {
    await c.end();
  }
}
try {
  if (request.action === "api") {
    await import("../../server/src/index.ts");
  } else {
    let result = {};
    if (request.action === "prepare") await prepare();
    else if (request.action === "backup") result = { name: await backup() };
    else if (request.action === "restore") await restore(request.name);
    else if (request.action === "list") result = await listBackups(folder);
    else throw Error("Unknown operation");
    console.log(JSON.stringify(result));
  }
} catch (error) {
  let detail = String(error.message ?? error);
  for (const value of Object.values(request.env))
    if (typeof value === "string" && value.length > 24)
      detail = detail.replaceAll(value, "[REDACTED]");
  console.error(detail.slice(0, 2000));
  console.error(
    "Desktop operation failed: " +
      request.action +
      ". Existing data and safety backups were preserved.",
  );
  process.exit(1);
}
