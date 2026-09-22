/**
 * domain/money.ts — PKR formatting and parsing utilities.
 * Pure TypeScript. No React, no DB, no Tauri imports.
 *
 * Design decisions:
 * - Money is stored as INTEGER whole rupees. No floats anywhere.
 * - Formatting uses standard Pakistani number grouping (lakh/crore optional).
 */

/**
 * Parse a formatted amount string to integer rupees.
 * Handles Indian/Pakistani grouping commas: "5,00,000" → 500000
 * Also handles plain integers: "500000" → 500000
 */
export function parseAmount(input: string): number {
  if (!input || typeof input !== "string") return 0;
  // Remove all commas and whitespace, then parse
  const cleaned = input.replace(/[,\s]/g, "");
  const value = parseInt(cleaned, 10);
  return isNaN(value) ? 0 : value;
}

/**
 * Format integer rupees to a human-readable PKR string.
 * Default: "Rs 500,000" (standard comma grouping)
 * With lakh/crore: "Rs 5,00,000" (Pakistani grouping)
 */
export function formatPKR(
  amount: number,
  options: { lakhCrore?: boolean; showSymbol?: boolean } = {},
): string {
  const { lakhCrore = false, showSymbol = true } = options;
  const prefix = showSymbol ? "Rs " : "";

  if (!Number.isFinite(amount)) return `${prefix}0`;

  const abs = Math.abs(Math.trunc(amount));
  const sign = amount < 0 ? "-" : "";

  const formatted = lakhCrore ? formatPakistaniGrouping(abs) : abs.toLocaleString("en-US");

  return `${sign}${prefix}${formatted}`;
}

/**
 * Format number with Pakistani lakh/crore grouping:
 * 500000 → "5,00,000"
 * 10000000 → "1,00,00,000"
 */
function formatPakistaniGrouping(n: number): string {
  if (n < 1000) return String(n);

  const str = String(n);
  // Last 3 digits, then groups of 2
  const last3 = str.slice(-3);
  const rest = str.slice(0, -3);

  if (!rest) return last3;

  // Group the rest in pairs from right
  const pairs: string[] = [];
  let i = rest.length;
  while (i > 0) {
    const start = Math.max(0, i - 2);
    pairs.unshift(rest.slice(start, i));
    i = start;
  }

  return [...pairs, last3].join(",");
}

/**
 * Format amount as a compact string for display (crore/lakh suffixes).
 * 10000000 → "1 Cr", 500000 → "5 L", 50000 → "50K"
 */
export function formatCompact(amount: number): string {
  const abs = Math.abs(Math.trunc(amount));
  if (abs >= 10_000_000) return `${(abs / 10_000_000).toFixed(1).replace(/\.0$/, "")} Cr`;
  if (abs >= 100_000) return `${(abs / 100_000).toFixed(1).replace(/\.0$/, "")} L`;
  if (abs >= 1_000) return `${(abs / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  return String(abs);
}
