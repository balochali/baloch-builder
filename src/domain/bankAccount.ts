import { z } from "zod";
export const BankAccountSchema = z.enum(["personal", "builder"], { message: "Choose Personal Account or Builder Account" });
export type BankAccount = z.infer<typeof BankAccountSchema>;
export const accountName = (value?: string | null) => value === "personal" ? "Personal Account" : value === "builder" ? "Builder Account" : "Unassigned";
