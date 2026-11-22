import { mkdir, readFile, writeFile, rename, rm, cp } from "node:fs/promises";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
export const runtimes = [
  {
    name: "postgres",
    version: "18.7-1",
    url: "https://get.enterprisedb.com/postgresql/postgresql-18.7-1-windows-x64-binaries.zip",
    sha256: "ead0bbc27fb678fa24dcf86b738981323042abd073c744103bf7f3aed23f9a33",
    folder: "pgsql",
  },
  {
    name: "node",
    version: "22.23.5",
    url: "https://nodejs.org/dist/v22.23.5/node-v22.23.5-win-x64.zip",
    sha256: "4a191082e9706866830379d577d2cc8a50c776fcd9436a8d061b063ed0d9a0e3",
    folder: "node-v22.23.5-win-x64",
  },
];
const root = path.resolve("src-tauri/resources");
export async function fetchRuntimes() {
  if (process.platform !== "win32" || process.arch !== "x64") throw Error("Build on Windows x64");
  await mkdir(root, { recursive: true });
  await mkdir("var/runtime-downloads", { recursive: true });
  for (const r of runtimes) {
    const zip = path.resolve("var/runtime-downloads/" + r.name + ".zip");
    let bytes;
    try {
      bytes = await readFile(zip);
    } catch {}
    if (!bytes || createHash("sha256").update(bytes).digest("hex") !== r.sha256) {
      console.log("Downloading " + r.name + " " + r.version);
      const response = await fetch(r.url);
      if (!response.ok) throw Error("Download failed: " + response.status);
      bytes = Buffer.from(await response.arrayBuffer());
      if (createHash("sha256").update(bytes).digest("hex") !== r.sha256)
        throw Error("SHA-256 mismatch: " + r.name);
      await writeFile(zip + ".partial", bytes);
      await rename(zip + ".partial", zip);
    }
    const destination = path.join(root, r.name);
    const marker = path.join(destination, ".verified-sha256");
    try {
      if ((await readFile(marker, "utf8")) === r.sha256) {
        console.log("Verified cached " + r.name + " " + r.version);
        continue;
      }
    } catch {}
    const stage = path.join(root, r.name + "-extract");
    await mkdir(stage, { recursive: true });
    // Fixed script and environment arguments avoid shell interpolation of paths.
    const result = spawnSync(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-File", path.resolve("scripts/extract-runtimes.ps1")],
      {
        env: { ...process.env, BB_ZIP: zip, BB_STAGE: stage, BB_RUNTIME: r.name },
        windowsHide: true,
        stdio: "inherit",
      },
    );
    if (result.status) throw Error("Extraction failed");
    for (const target of [stage, destination])
      if (!path.resolve(target).startsWith(root + path.sep))
        throw Error("Runtime path outside resources");
    await rm(destination, { recursive: true, force: true });
    await mkdir(destination, { recursive: true });
    for (const entry of r.name === "postgres"
      ? ["bin", "lib", "share", "doc"]
      : ["node.exe", "LICENSE"])
      await cp(path.join(stage, r.folder, entry), path.join(destination, entry), {
        recursive: true,
      });
    await writeFile(marker, r.sha256);
    await rm(stage, { recursive: true, force: true });
    console.log("Verified " + r.name + " " + r.version);
  }
  await writeFile(path.join(root, "runtimes.json"), JSON.stringify(runtimes, null, 2));
}
if (process.argv[1] === fileURLToPath(import.meta.url)) await fetchRuntimes();
