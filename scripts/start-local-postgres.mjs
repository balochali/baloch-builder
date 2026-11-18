import { spawn } from "node:child_process";
import { join } from "node:path";
import { access } from "node:fs/promises";

function run(executable, args) {
  return new Promise((resolve, reject) => {
    // PostgreSQL can inherit pg_ctl's pipes on Windows and keep them open.
    // Its own log contains startup diagnostics; do not wait for pipe EOF.
    const child = spawn(executable, args, { windowsHide: true, stdio: "ignore" });
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) resolve();
      else reject(Object.assign(new Error(`pg_ctl exited with ${code}; check PostgreSQL server.log`), { code }));
    });
  });
}

// Only manage an explicitly configured, existing local cluster. Never initialize
// or replace a database during normal application startup.
export async function startLocalPostgres() {
  const directory = process.env.BALOCH_PGDATA;
  if (!directory) return;
  const database = new URL(process.env.DATABASE_URL);
  if (database.hostname !== "127.0.0.1") {
    throw new Error("Managed PostgreSQL requires DATABASE_URL to use 127.0.0.1");
  }
  try {
    await access(join(directory, "PG_VERSION"));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    throw new Error(
      `The PostgreSQL cluster configured by BALOCH_PGDATA is missing or incomplete: ${directory}. ` +
      "Restore the existing database from backup or update BALOCH_PGDATA in .env.local to its actual location. " +
      "If PostgreSQL is managed separately, remove BALOCH_PGDATA and check DATABASE_URL. " +
      "No database files were created or replaced.",
    );
  }
  const executable = join(process.env.BALOCH_PGBIN || "", process.platform === "win32" ? "pg_ctl.exe" : "pg_ctl");
  try {
    await run(executable, ["status", "-D", directory]);
    return;
  } catch (error) {
    if (error.code !== 3) throw error;
  }
  await run(executable, ["start", "-D", directory, "-l", join(directory, "..", "postgres18-server.log"),
    "-o", `-h 127.0.0.1 -p ${database.port || "5432"}`, "-w", "-t", "90"]);
}
