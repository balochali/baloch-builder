import { readdir, mkdir, cp } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
const vswhere = path.join(
  process.env["ProgramFiles(x86)"],
  "Microsoft Visual Studio/Installer/vswhere.exe",
);
const result = spawnSync(
  vswhere,
  [
    "-latest",
    "-products",
    "*",
    "-requires",
    "Microsoft.VisualStudio.Component.VC.Tools.x86.x64",
    "-property",
    "installationPath",
  ],
  { encoding: "utf8", windowsHide: true },
);
if (result.status) throw Error("Visual Studio C++ build tools required");
const redist = path.join(result.stdout.trim(), "VC/Redist/MSVC");
const versions = (await readdir(redist))
  .filter((n) => /^14\./.test(n))
  .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
const base = path.join(redist, versions.at(-1), "x64");
const crt = (await readdir(base)).find((n) => n.endsWith(".CRT"));
if (!crt) throw Error("MSVC app-local runtime not found");
for (const target of [
  "src-tauri/resources/vcredist",
  "src-tauri/resources/postgres/bin",
  "src-tauri/resources/node",
]) {
  await mkdir(target, { recursive: true });
  await cp(path.join(base, crt), target, { recursive: true });
}
console.log("Bundled app-local MSVC runtime " + versions.at(-1));
