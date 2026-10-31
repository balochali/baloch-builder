import { z } from "zod";
import { parseAmount } from "./money";
export const workbookSheets = [
  "partners",
  "construction",
  "estimate",
  "flats",
  "sales_estimate",
] as const;
export type WorkbookSheet = (typeof workbookSheets)[number];
const text = z.string().trim().max(300).default("");
const required = z.string().trim().min(1, "Required").max(160);
const money = z
  .string()
  .regex(/^\d{1,12}(\.\d{1,2})?$/, "Enter a positive amount with up to 2 decimal places")
  .default("0");
const decimal = z
  .string()
  .regex(/^\d{1,10}(\.\d{1,4})?$/, "Enter a positive number with up to 4 decimal places")
  .default("0");
const whole = z.coerce.number().int().min(0).max(10000).default(0);
export const salesSizeUnits = ["sq ft", "sq yd", "sq m", "marla", "kanal"] as const;
export type SalesSizeUnit = (typeof salesSizeUnits)[number];
export const workbookSchemas = {
  partners: z
    .object({
      name: required,
      phone: text,
      share: z
        .string()
        .regex(/^\d{1,3}(\.\d{1,4})?$/)
        .refine((v) => Number(v) <= 100, "Share cannot exceed 100%")
        .default("0"),
      agreed: money,
      received: money,
      paid: money,
      notes: text,
    })
    .strict(),
  construction: z
    .object({
      item: required,
      contractor: text,
      stage: z.enum(["Planned", "In Progress", "Completed"]).default("Planned"),
      agreed: money,
      paid: money,
      notes: text,
    })
    .strict(),
  estimate: z
    .object({
      item: required,
      unit: text,
      quantity: decimal,
      rate: money,
      minimumCost: money.optional(),
      maximumCost: money.optional(),
      notes: text,
      custom: z.record(z.string().max(2000)).default({}),
    })
    .strict(),
  flats: z
    .object({
      number: required,
      floor: whole,
      rooms: whole,
      area: decimal,
      status: z.enum(["Available", "Reserved", "Sold"]).default("Available"),
      buyer: text,
      seller: text,
      price: money,
      received: money,
      notes: text,
    })
    .strict()
    .superRefine((row, ctx) => {
      if (row.status === "Sold" && !row.buyer)
        ctx.addIssue({
          code: "custom",
          path: ["buyer"],
          message: "Enter the buyer for a sold flat",
        });
    }),
  sales_estimate: z
    .object({
      unitType: required,
      rooms: whole.optional(),
      totalArea: decimal.optional(),
      size: decimal,
      sizeUnit: z.enum(salesSizeUnits).default("sq ft"),
      units: z.coerce.number().int().min(0).max(100000).default(0),
      minimumPrice: money,
      maximumPrice: money,
      notes: text,
    })
    .strict()
    .superRefine((row, ctx) => {
      if (row.units < 1)
        ctx.addIssue({ code: "custom", path: ["units"], message: "Enter how many units" });
      if (parseAmount(row.maximumPrice) < parseAmount(row.minimumPrice))
        ctx.addIssue({
          code: "custom",
          path: ["maximumPrice"],
          message: "Maximum price cannot be less than the minimum price",
        });
    }),
};
export type WorkbookField = {
  key: string;
  label: string;
  options?: string[];
  money?: boolean;
  hidden?: boolean;
};
export const workbookFields: Record<WorkbookSheet, WorkbookField[]> = {
  partners: [
    { key: "name", label: "Partner Name" },
    { key: "phone", label: "Phone" },
    { key: "share", label: "Share %" },
    { key: "agreed", label: "Agreed PKR", money: true },
    { key: "received", label: "Received PKR", money: true },
    { key: "paid", label: "Paid Back PKR", money: true },
    { key: "notes", label: "Notes", hidden: true },
  ],
  construction: [
    { key: "item", label: "Work Item" },
    { key: "contractor", label: "Contractor" },
    { key: "stage", label: "Stage", options: ["Planned", "In Progress", "Completed"] },
    { key: "agreed", label: "Agreed PKR", money: true },
    { key: "paid", label: "Paid PKR", money: true },
    { key: "notes", label: "Notes" },
  ],
  estimate: [
    { key: "item", label: "Item" },
    { key: "unit", label: "Unit" },
    { key: "quantity", label: "Quantity" },
    { key: "minimumCost", label: "Minimum Cost", money: true },
    { key: "maximumCost", label: "Maximum Cost", money: true },
    { key: "notes", label: "Notes" },
  ],
  flats: [
    { key: "number", label: "Flat No" },
    { key: "floor", label: "Floor" },
    { key: "rooms", label: "Rooms" },
    { key: "area", label: "Area sq ft" },
    { key: "status", label: "Status", options: ["Available", "Reserved", "Sold"] },
    { key: "buyer", label: "Buyer" },
    { key: "seller", label: "Seller", hidden: true },
    { key: "price", label: "Sale Price PKR", money: true },
    { key: "received", label: "Received PKR", money: true },
    { key: "notes", label: "Notes", hidden: true },
  ],
  sales_estimate: [
    { key: "unitType", label: "Unit Type" },
    { key: "rooms", label: "Rooms" },
    { key: "totalArea", label: "Total Area (sq ft)" },
    { key: "size", label: "Size", hidden: true },
    { key: "sizeUnit", label: "Size Unit", options: [...salesSizeUnits] },
    { key: "units", label: "No. of Units" },
    { key: "minimumPrice", label: "Min Price / Unit", money: true },
    { key: "maximumPrice", label: "Max Price / Unit", money: true },
    { key: "notes", label: "Notes" },
  ],
};
export function blankWorkbookRow(sheet: WorkbookSheet): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  for (const f of workbookFields[sheet])
    row[f.key] =
      f.options?.[0] ??
      (f.money ||
      ["share", "quantity", "area", "floor", "rooms", "size", "units", "totalArea"].includes(f.key)
        ? "0"
        : "");
  if (sheet === "estimate") {
    row.custom = {};
    row.rate = "0";
  }
  return row;
}
export function workbookData(sheet: WorkbookSheet, row: Record<string, unknown>) {
  let salesArea = row.totalArea;
  if (sheet === "sales_estimate" && salesArea == null) {
    try {
      salesArea = salesEstimateTotals(row).totalArea;
    } catch {
      salesArea = "";
    }
  }
  return {
    ...Object.fromEntries(
      workbookFields[sheet].map((f) => [f.key, row[f.key] ?? blankWorkbookRow(sheet)[f.key]]),
    ),
    ...(sheet === "sales_estimate" ? { totalArea: salesArea } : {}),
    ...(sheet === "estimate"
      ? { custom: row.custom ?? {}, rate: row.rate ?? "0", ...estimateCosts(row) }
      : {}),
  };
}

/** Costs are totals per item. Preserve existing single estimates as an equal cost range. */
export function estimateCosts(row: Record<string, unknown>) {
  let legacy = "0";
  if (row.minimumCost == null || row.maximumCost == null) {
    const quantity = String(row.quantity ?? "0");
    if (/^\d{1,10}(\.\d{1,4})?$/.test(quantity)) {
      const [whole, fraction = ""] = quantity.split(".");
      const total =
        (BigInt(whole + fraction.padEnd(4, "0")) * parseAmount(String(row.rate ?? "0")) + 5000n) /
        10000n;
      legacy = `${total / 100n}.${String(total % 100n).padStart(2, "0")}`;
    }
  }
  return {
    minimumCost: String(row.minimumCost ?? legacy),
    maximumCost: String(row.maximumCost ?? legacy),
  };
}

/** Exact decimal multiplication on strings, e.g. ("2.5", "4") -> "10". */
function multiplyDecimal(a: string, b: string): string {
  const split = (value: string) => {
    if (!/^\d+(\.\d+)?$/.test(value)) throw Error("Invalid decimal");
    const [whole, fraction = ""] = value.split(".");
    return { n: BigInt(whole + fraction), scale: fraction.length };
  };
  const x = split(a),
    y = split(b);
  const scale = x.scale + y.scale;
  const raw = (x.n * y.n).toString().padStart(scale + 1, "0");
  if (!scale) return raw;
  const text = raw.slice(0, -scale) + "." + raw.slice(-scale);
  return text.replace(/0+$/, "").replace(/\.$/, "");
}

/** Round a non-negative decimal string half-up to `places` decimals. */
function roundDecimal(value: string, places: number): string {
  const [whole, fraction = ""] = value.split(".");
  if (fraction.length <= places) return fraction ? value : whole;
  const scaled = BigInt(whole + fraction.slice(0, places));
  const next = fraction.charCodeAt(places) >= 53 ? scaled + 1n : scaled;
  const raw = next.toString().padStart(places + 1, "0");
  return places ? raw.slice(0, -places) + "." + raw.slice(-places) : raw;
}

const squareMetreToFeet = "10.76391041671";
/** Square feet in one size unit; marla size comes from project area settings. */
function feetPerSizeUnit(unit: SalesSizeUnit, marlaSqft: string): string {
  if (unit === "sq yd") return "9";
  if (unit === "sq m") return squareMetreToFeet;
  if (unit === "marla") return marlaSqft;
  if (unit === "kanal") return multiplyDecimal(marlaSqft, "20");
  return "1";
}

/** Prices are per unit and totals are in paisa. Area is returned in square feet, rounded to 2 decimals. */
export function salesEstimateTotals(row: Record<string, unknown>, marlaSqft = "272.25") {
  if (row.totalArea != null && !/^\d{1,10}(\.\d{1,4})?$/.test(String(row.totalArea)))
    throw Error("Invalid total area");
  const size = String(row.size ?? "0");
  if (!/^\d{1,10}(\.\d{1,4})?$/.test(size)) throw Error("Invalid size");
  const units = Number(row.units ?? 0);
  if (!Number.isInteger(units) || units < 0) throw Error("Invalid number of units");
  const rawUnit = String(row.sizeUnit ?? "sq ft");
  if (!(salesSizeUnits as readonly string[]).includes(rawUnit)) throw Error("Invalid size unit");
  const unit = rawUnit as SalesSizeUnit;
  if (!/^\d{1,10}(\.\d{1,4})?$/.test(marlaSqft) || Number(marlaSqft) <= 0)
    throw Error("Invalid marla size");
  const area = multiplyDecimal(
    multiplyDecimal(size, String(units)),
    feetPerSizeUnit(unit, marlaSqft),
  );
  return {
    totalArea:
      row.totalArea == null ? roundDecimal(area, 2) : roundDecimal(String(row.totalArea), 2),
    minimumTotal: BigInt(units) * parseAmount(String(row.minimumPrice ?? "0")),
    maximumTotal: BigInt(units) * parseAmount(String(row.maximumPrice ?? "0")),
  };
}

/** Add square-foot amounts exactly (each already rounded to 2 decimals). */
export function sumAreas(values: string[]): string {
  let hundredths = 0n;
  for (const value of values) {
    if (!/^\d{1,16}(\.\d{1,2})?$/.test(value)) throw Error("Invalid area");
    const [whole, fraction = ""] = value.split(".");
    hundredths += BigInt(whole + fraction.padEnd(2, "0"));
  }
  const whole = hundredths / 100n,
    fraction = String(hundredths % 100n)
      .padStart(2, "0")
      .replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : String(whole);
}
