import { z } from "zod";
export const costHeadSchema = z
  .object({
    code: z
      .string()
      .trim()
      .regex(/^[A-Za-z0-9-]{2,40}$/),
    name: z.string().trim().min(1).max(160),
    parent_id: z.string().uuid().nullable().default(null),
    default_account_id: z.string().uuid().nullable().default(null),
    budget_only: z.boolean().default(false),
    active: z.boolean().default(true),
    sort_order: z.number().int().min(0).default(0),
  })
  .strict();
export const costHeadPatchSchema = costHeadSchema.partial().strict();
