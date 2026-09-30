import { z } from "zod";
export const PaymentDetailsSchema = z
  .object({
    method: z.enum(["cash", "bank", "digital", "cheque", "other"]),
    received_by: z.string().trim().min(1, "Enter who received the money").max(120),
    provider: z.string().trim().max(120),
    account: z.string().trim().max(120),
    reference: z.string().trim().max(120),
  })
  .superRefine((value, ctx) => {
    if (value.method !== "cash" && !value.provider)
      ctx.addIssue({
        code: "custom",
        path: ["provider"],
        message: "Enter the bank, wallet or payment service",
      });
  });
export type PaymentDetails = z.infer<typeof PaymentDetailsSchema>;
export const emptyPaymentDetails: PaymentDetails = {
  method: "cash",
  received_by: "",
  provider: "",
  account: "",
  reference: "",
};
export function paymentSummary(raw?: string | null): string {
  if (!raw) return "";
  try {
    const p = JSON.parse(raw) as PaymentDetails;
    return [
      p.method,
      p.received_by && `Received by: ${p.received_by}`,
      p.provider,
      p.account && `Account: ${p.account}`,
      p.reference && `Receipt / reference: ${p.reference}`,
    ]
      .filter(Boolean)
      .join(" · ");
  } catch {
    return "";
  }
}
