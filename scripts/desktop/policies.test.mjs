import test from "node:test";
import assert from "node:assert/strict";
import { retainedBackups, isNewer } from "./policies.mjs";
test("retains the newest 14 dumps and ignores unrelated and partial files", () => {
  const names = Array.from(
    { length: 20 },
    (_, i) => `baloch-202611${String(i + 1).padStart(2, "0")}-120000.dump`,
  );
  assert.deepEqual(
    retainedBackups([...names.reverse(), "notes.txt", "baloch-20261130-120000.dump.partial"]),
    names.slice(14).reverse(),
  );
});
test("refuses newer semantic data versions", () => {
  assert(isNewer("1.10.0", "1.9.9"));
  assert(!isNewer("1.2.0", "1.2.0"));
  assert(!isNewer("0.9.0", "1.0.0"));
});
