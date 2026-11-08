export const pkrUnits = [
  { size: 1_000_000_000, suffix: "Ar" },
  { size: 10_000_000, suffix: "C" },
  { size: 100_000, suffix: "L" },
  { size: 1_000, suffix: "K" },
] as const;
export function formatPKR(value: number) {
  const unit = pkrUnits.find((unit) => Math.abs(value) >= unit.size);
  const rounded = Math.round(Math.abs(value) / ((unit?.size ?? 1) / 100)) / 100;
  return (value < 0 ? "-" : "") + rounded + (unit ? " " + unit.suffix : "");
}
export function formatPercent(value: number | null) {
  return value === null
    ? "—"
    : value.toLocaleString("en-PK", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
        useGrouping: false,
      }) + "%";
}
export function parsePKR(text: string) {
  const match = /^(\d+(?:\.\d+)?|\.\d+)\s*(ar|c|l|k)?$/i.exec(text.trim().replace(/,/g, ""));
  if (!match) return NaN;
  return (
    Number(match[1]) *
    (pkrUnits.find((unit) => unit.suffix.toLowerCase() === match[2]?.toLowerCase())?.size ?? 1)
  );
}
