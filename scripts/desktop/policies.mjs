import { readdir, stat, unlink, rm } from "node:fs/promises";
export function retainedBackups(names, keep = 14) {
  return names
    .filter((n) => /^baloch-\d{8}-\d{6}(?:-\d+)?\.dump$/.test(n))
    .sort()
    .slice(0, -keep);
}
export async function pruneBackups(folder) {
  for (const name of retainedBackups(await readdir(folder))) {
    await unlink(folder + "/" + name);
    await rm(folder + "/" + name + ".files", { recursive: true, force: true });
    await rm(folder + "/" + name + ".json", { force: true });
  }
}
export function isNewer(saved, current) {
  const a = saved.split(".").map(Number),
    b = current.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] > b[i];
  }
  return false;
}
export async function listBackups(folder) {
  return Promise.all(
    (await readdir(folder))
      .filter((n) => /^baloch-\d{8}-\d{6}(?:-\d+)?\.dump$/.test(n))
      .sort()
      .reverse()
      .map(async (name) => ({ name, size: (await stat(folder + "/" + name)).size })),
  );
}
