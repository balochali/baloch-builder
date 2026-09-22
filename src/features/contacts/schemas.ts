import { z } from "zod";

/** Zod schema for the Contact form (create + edit) */
export const ContactFormSchema = z.object({
  name: z.string().min(1, "Name is required").max(120, "Name is too long"),
  phone: z.string().max(30, "Phone too long"),
  phone2: z.string().max(30, "Phone too long"),
  address: z.string().max(500, "Address too long"),
  notes: z.string().max(2000, "Notes too long"),
});

export type ContactFormValues = z.infer<typeof ContactFormSchema>;
