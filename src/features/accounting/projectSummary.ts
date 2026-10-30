import type { Row } from "./Grid";

// Add displayed decimal areas exactly, without rounding each row through a float.
export function projectSummary(rows: Row[]) {
  let total = 0n;
  const scale = 10n ** 24n;
  let excluded = 0;
  for (const row of rows) {
    const value = String(row.saleable_area_sqft ?? "").trim();
    if (!value) continue;
    if (!/^\d+(\.\d{1,24})?$/.test(value)) {
      excluded++;
      continue;
    }
    const [whole, fraction = ""] = value.split(".");
    total += BigInt(whole) * scale + BigInt(fraction.padEnd(24, "0"));
  }
  const fraction = String(total % scale)
    .padStart(24, "0")
    .replace(/0+$/, "");
  return {
    count: rows.filter((row) => !row._new).length,
    drafts: rows.filter((row) => row._new).length,
    active: rows.filter((row) => !row._new && !row.archived).length,
    area: String(total / scale) + (fraction ? "." + fraction : ""),
    excluded,
  };
}
