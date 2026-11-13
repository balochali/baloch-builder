import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { startLocalPostgres } from "./start-local-postgres.mjs";

const api = new URL("/api/health", process.env.API_PROXY_TARGET || "http://127.0.0.1:3000");

async function apiReady() {
  try {
    const response = await fetch(api, { signal: AbortSignal.timeout(1000) });
    return response.ok && (await response.json()).ok === true;
  } catch {
    return false;
  }
}

const children = [];
function start(args) {
  const child = spawn(process.execPath, args, { stdio: "inherit" });
  children.push(child);
  return child;
}

function stop() {
  for (const child of children) child.kill();
}

process.on("exit", stop);
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => process.exit());

let backend;
if (!(await apiReady())) {
  await startLocalPostgres();
  backend = start(["--import", "tsx", "server/src/index.ts"]);
  const deadline = Date.now() + 15000;
  while (!(await apiReady())) {
    if (backend.exitCode !== null || Date.now() >= deadline) {
      console.error("Desktop startup stopped because the local API is unavailable. Check PostgreSQL and the database connection in .env.local, then relaunch.");
      process.exit(1);
    }
    await delay(200);
  }
}

const frontend = start(["node_modules/vite/bin/vite.js", ...process.argv.slice(2)]);
frontend.once("exit", (code) => process.exit(code ?? 1));
backend?.once("exit", () => {
  console.error("The local API stopped. Check its log before relaunching the desktop app.");
  process.exit(1);
});
