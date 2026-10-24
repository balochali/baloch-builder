/** Exact PKR conversion; JSON and database boundaries use integer paisa strings. */
export function parseAmount(input: string): bigint {
  const value = input.trim().replace(/,/g, "");
  if (!/^-?\d+(\.\d{1,2})?$/.test(value))
    throw new Error("Enter a PKR amount with at most two decimal places");
  const negative = value.startsWith("-");
  const [whole, fraction = ""] = value.replace(/^-/, "").split(".");
  return (BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"))) * (negative ? -1n : 1n);
}
export function formatPKR(
  amount: bigint,
  options: { lakhCrore?: boolean; showSymbol?: boolean } = {},
): string {
  const absolute = amount < 0n ? -amount : amount;
  const whole = (absolute / 100n).toLocaleString(options.lakhCrore ? "en-IN" : "en-US");
  return `${amount < 0n ? "-" : ""}${options.showSymbol === false ? "" : "Rs "}${whole}.${String(absolute % 100n).padStart(2, "0")}`;
}
