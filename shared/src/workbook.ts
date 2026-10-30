import { z } from "zod";
import { parseAmount } from "./money";
export const workbookSheets = ["partners", "construction", "estimate", "flats"] as const;
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
};
export function blankWorkbookRow(sheet: WorkbookSheet): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  for (const f of workbookFields[sheet])
    row[f.key] =
      f.options?.[0] ??
      (f.money || ["share", "quantity", "area", "floor", "rooms"].includes(f.key) ? "0" : "");
  if (sheet === "estimate") {
    row.custom = {};
    row.rate = "0";
  }
  return row;
}
export function workbookData(sheet: WorkbookSheet, row: Record<string, unknown>) {
  return {
    ...Object.fromEntries(
      workbookFields[sheet].map((f) => [f.key, row[f.key] ?? blankWorkbookRow(sheet)[f.key]]),
    ),
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
