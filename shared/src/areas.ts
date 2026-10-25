export type AreaUnit = "sqft" | "marla" | "kanal";
export interface AreaSettings {
  areaDisplayUnit: AreaUnit;
  marlaSqft: string;
}
export const defaultAreaSettings: AreaSettings = { areaDisplayUnit: "sqft", marlaSqft: "272.25" };
function decimal(value: string) {
  if (!/^\d{1,24}(\.\d{1,24})?$/.test(value)) throw Error("Area must be a non-negative decimal");
  const [whole, fraction = ""] = value.split(".");
  return { n: BigInt(whole + fraction), scale: fraction.length };
}
function format(n: bigint, scale: number) {
  const raw = n.toString().padStart(scale + 1, "0");
  return scale ? raw.slice(0, -scale) + "." + raw.slice(-scale).replace(/0+$/, "") || "0" : raw;
}
function canonical(n: bigint, scale: number) {
  return format(n, scale).replace(/\.$/, "");
}
function factor(unit: AreaUnit, marlaSqft: string) {
  if (unit === "sqft") return { n: 1n, scale: 0 };
  const f = decimal(marlaSqft);
  if (!f.n) throw Error("Marla size must be greater than zero");
  return { n: f.n * (unit === "kanal" ? 20n : 1n), scale: f.scale };
}
export function areaToSqft(value: string, unit: AreaUnit, marlaSqft = "272.25") {
  const v = decimal(value),
    f = factor(unit, marlaSqft);
  return canonical(v.n * f.n, v.scale + f.scale);
}
export function areaFromSqft(value: string, unit: AreaUnit, marlaSqft = "272.25") {
  const v = decimal(value),
    f = factor(unit, marlaSqft);
  if (unit === "sqft") return canonical(v.n, v.scale);
  // Display rounds to 12 places; preserve original sqft on unchanged cells.
  const numerator = v.n * 10n ** BigInt(f.scale + 12),
    denominator = f.n * 10n ** BigInt(v.scale);
  return canonical((numerator + denominator / 2n) / denominator, 12);
}
