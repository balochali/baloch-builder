import { z } from "zod";
export const roles = ["admin", "accountant", "sales", "construction"] as const;
export const roleSchema = z.enum(roles);
export type Role = z.infer<typeof roleSchema>;
export const permissions = {
  projects: ["admin", "accountant", "sales", "construction"],
  manageProjects: ["admin"],
  costHeads: ["admin", "accountant"],
  readCostHeads: ["admin", "accountant", "construction"],
  users: ["admin"],
  accounts: ["admin", "accountant"],
  ledger: ["admin", "accountant"],
  periods: ["admin", "accountant"],
  audit: ["admin"],
  settings: ["admin"],
} satisfies Record<string, Role[]>;
export type Permission = keyof typeof permissions;
export function can(role: Role, permission: Permission): boolean {
  return (permissions[permission] as readonly string[]).includes(role);
}

export * from "./projects";

export * from "./feasibility";

export * from "./projectSite";

export * from "./funding";

export * from "./journal";
export * from "./land";
