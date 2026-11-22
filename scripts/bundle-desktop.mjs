import { build } from "esbuild";
import { cp, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
const root = "src-tauri/resources/app";
await mkdir(root, { recursive: true });
await build({
  entryPoints: ["scripts/desktop/entry.mjs"],
  outfile: root + "/desktop.mjs",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  external: ["argon2", "pg-native"],
  banner: {
    js: "import {createRequire as __createRequire} from 'node:module';const require=__createRequire(import.meta.url);",
  },
});
for (const name of ["argon2", "node-gyp-build", "@phc/format"])
  await cp("node_modules/" + name, root + "/node_modules/" + name, { recursive: true });
await cp("server/migrations", root + "/migrations", { recursive: true });
await cp("dist", root + "/dist", { recursive: true });
await writeFile(root + "/package.json", JSON.stringify({ type: "module" }));
console.log("Bundled API, migrations, frontend and Argon2 native prebuilds.");
