import { z } from "zod";
export const projectTypes = [
  "Apartments",
  "Commercial / Plaza",
  "Houses / Villas",
  "Plots / Scheme",
  "Mixed use",
] as const;
export const projectStatuses = ["Planning", "Under construction", "Completed", "On hold"] as const;
export const areaUnits = ["Marla", "Kanal", "Sq ft", "Acre"] as const;
const amount = z.number().finite().nonnegative().max(1e15);
export const areaSchema = z.object({ value: amount, unit: z.enum(areaUnits) });
export const partnerSchema = z.object({
  partnerId: z.string().uuid(),
  name: z.string().trim().min(1).max(120),
  sharePercent: z.number().min(0).max(100),
});
export const basicsSchema = z
  .object({
    type: z.enum(projectTypes).nullable(),
    status: z.enum(projectStatuses),
    address: z.string().trim().max(300),
    city: z.string().trim().max(120),
    landArea: areaSchema.nullable(),
    startDate: z.string().date().nullable(),
    expectedEndDate: z.string().date().nullable(),
  })
  .refine(
    (d) => !d.startDate || !d.expectedEndDate || d.expectedEndDate >= d.startDate,
    "Expected completion cannot be before the start date.",
  );
export const budgetSchema = z.object({
  estimatedBudget: amount.nullable(),
  partners: z.array(partnerSchema).max(50),
});
export const projectName = z.string().trim().min(1, "Enter a project name").max(120);
export type Basics = z.infer<typeof basicsSchema>;
export type Budget = z.infer<typeof budgetSchema>;
export type Partner = z.infer<typeof partnerSchema>;
export type ProjectFile = { id: string; name: string; purchaseId: string | null };
export type Project = Basics &
  Budget & { id: string; name: string; draft: boolean; createdAt: string; updatedAt: string };
export const emptyBasics: Basics = {
  type: null,
  status: "Planning",
  address: "",
  city: "",
  landArea: null,
  startDate: null,
  expectedEndDate: null,
};
export const emptyBudget: Budget = { estimatedBudget: null, partners: [] };
