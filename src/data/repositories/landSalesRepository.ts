import { z } from "zod";
import { execute } from "@/data/client";
import { now } from "@/data/ids";
import { PaymentDetailsSchema, validateMethod } from "./projectPartnersRepository";
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const parsed = new Date(value);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  }, "Enter a valid date");
export const LandSaleSchema = z
  .object({
    project_id: z.string().uuid(),
    buyer_name: z.string().trim().min(1, "Enter the buyer's name").max(120),
    buyer_phone: z.string().trim().max(40),
    buyer_address: z.string().trim().max(500),
    sale_date: date,
    price: z.number().int().positive("Enter a sale price").safe(),
    received: z.number().int().nonnegative().safe(),
    account_key: z.enum(["personal", "builder"]),
    method: z.enum(["cash", "bank", "digital", "cheque", "other"]),
    reference: z.string().trim().max(120),
    payment_details: PaymentDetailsSchema,
    notes: z.string().trim().max(2000),
  })
  .superRefine((value, ctx) => {
    if (value.received > value.price)
      ctx.addIssue({
        code: "custom",
        path: ["received"],
        message: "Received amount cannot exceed the sale price",
      });
    if (value.received > 0)
      validateMethod(value.method, value.reference, value.payment_details, ctx);
  });
export type LandSaleInput = z.infer<typeof LandSaleSchema>;
/** The database trigger checks acquisition and commits the status with this sale. A stable ID makes retries safe. */
export async function recordLandSale(id: string, input: LandSaleInput): Promise<void> {
  z.string().uuid().parse(id);
  const value = LandSaleSchema.parse(input),
    timestamp = now();
  await execute(
    "INSERT INTO project_sales (id, project_id, kind, floor_index, unit_number, rooms, buyer_name, buyer_phone, buyer_address, sale_date, price, notes, created_at, updated_at, archived, custom) VALUES (?, ?, 'land', 0, 'Land', NULL, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?) ON CONFLICT(id) DO NOTHING",
    [
      id,
      value.project_id,
      value.buyer_name,
      value.buyer_phone,
      value.buyer_address,
      value.sale_date,
      value.price,
      value.notes,
      timestamp,
      timestamp,
      JSON.stringify({
        received: value.received,
        account_key: value.account_key,
        method: value.method,
        reference: value.reference,
        payment_details: value.payment_details,
      }),
    ],
  );
}
