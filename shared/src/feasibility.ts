import { z } from "zod";
const text = z.string().max(500);
const id = z.string().min(1).max(80);
const amount = z.number().finite().nonnegative().max(1e15);
const percent = z
  .number()
  .min(0)
  .max(100)
  .transform((value) => Math.round(value * 100) / 100);
export const feasibilitySchema = z.object({
  status: z.enum(["draft", "approved"]),
  approvedAt: z.string().datetime().nullable(),
  costCategories: z
    .array(
      z.object({
        id,
        name: text,
        contractor: z.boolean().optional(),
        contingencyPercent: percent.optional(),
        rows: z
          .array(
            z
              .object({
                id,
                item: text,
                amount: amount.optional(),
                minAmount: amount.optional(),
                maxAmount: amount.optional(),
                notes: text,
                type: z.enum(["Labour", "Labour + Material"]).optional(),
              })
              .transform(({ amount: legacy, minAmount, maxAmount, ...row }) => ({
                ...row,
                minAmount: minAmount ?? legacy,
                maxAmount: maxAmount ?? legacy,
              })),
          )
          .max(500),
      }),
    )
    .max(100),
  salesRows: z
    .array(
      z
        .object({
          id,
          unitType: text,
          buildingUnitId: id.optional(),
          count: amount.int(),
          areaSqft: amount,
          ratePerSqft: amount.optional(),
          minRatePerSqft: amount.optional(),
          maxRatePerSqft: amount.optional(),
          priceOverride: amount.optional(),
          soldPercent: percent,
        })
        .transform(({ ratePerSqft: legacy, minRatePerSqft, maxRatePerSqft, ...row }) => ({
          ...row,
          minRatePerSqft: minRatePerSqft ?? legacy,
          maxRatePerSqft: maxRatePerSqft ?? legacy,
        })),
    )
    .max(500),
  partners: z
    .array(
      z.object({
        id,
        partnerId: id.optional(),
        name: text,
        contributionType: z.enum(["Cash", "Land", "Cash + Land"]),
        capital: amount,
        profitSharePercent: percent.optional(),
      }),
    )
    .max(500),
  updatedAt: z.string().datetime().nullable(),
});
export type FeasibilityData = z.infer<typeof feasibilitySchema>;

export const costRow = () => ({
  id: crypto.randomUUID(),
  item: "",
  minAmount: undefined as number | undefined,
  maxAmount: undefined as number | undefined,
  notes: "",
});
export const salesRow = () => ({
  id: crypto.randomUUID(),
  unitType: "",
  count: 0,
  areaSqft: 0,
  minRatePerSqft: undefined as number | undefined,
  maxRatePerSqft: undefined as number | undefined,
  soldPercent: 100,
});
export const fundingRow = (): FeasibilityData["partners"][number] => ({
  id: crypto.randomUUID(),
  name: "",
  capital: 0,
  contributionType: "Cash",
});
export function defaultFeasibility(): FeasibilityData {
  const categories: [string, string[]][] = [
    [
      "Land",
      ["Land purchase price", "Registration / stamp duty", "Broker commission", "Legal fees"],
    ],
    ["Approvals", ["Building plan approval", "Authority fees", "NOC", "Utility connections"]],
    ["Construction", ["Structure", "Finishing", "Electrical & plumbing", "Lifts", "Elevation"]],
    ["Contractors", []],
    ["Site & overheads", ["Site staff", "Fuel", "Utilities", "Security", "Office"]],
    ["Sales & marketing", ["Advertising", "Sales commission"]],
    ["Financing & taxes", ["Loan markup", "Taxes"]],
    ["Contingency", []],
  ];
  return {
    status: "draft",
    approvedAt: null,
    updatedAt: null,
    salesRows: [salesRow()],
    partners: [],
    costCategories: categories.map(([name, items]) => ({
      id: crypto.randomUUID(),
      name,
      rows: items.map((item) => ({ ...costRow(), item })),
      ...(name === "Contractors" ? { contractor: true } : {}),
      ...(name === "Contingency" ? { contingencyPercent: 5 } : {}),
    })),
  };
}
