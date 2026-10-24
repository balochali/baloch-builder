import { pgTable, uuid, text, boolean, timestamp, bigint, date } from "drizzle-orm/pg-core";
export const users = pgTable("users", {
  id: uuid().primaryKey(),
  email: text().notNull(),
  role: text().notNull(),
  active: boolean().notNull(),
});
export const projects = pgTable("projects", {
  id: uuid().primaryKey(),
  code: text().notNull(),
  name: text().notNull(),
  archived: boolean().notNull(),
  createdAt: timestamp("created_at"),
  createdBy: uuid("created_by"),
});
export const accounts = pgTable("accounts", {
  id: uuid().primaryKey(),
  code: text().notNull(),
  name: text().notNull(),
  type: text().notNull(),
  normalBalance: text("normal_balance").notNull(),
  parentId: uuid("parent_id"),
  isCashBank: boolean("is_cash_bank"),
  archived: boolean().notNull(),
});
export const vouchers = pgTable("vouchers", {
  id: uuid().primaryKey(),
  type: text().notNull(),
  date: date().notNull(),
  status: text().notNull(),
  number: text(),
  narration: text(),
  createdBy: uuid("created_by"),
});
export const voucherLines = pgTable("voucher_lines", {
  id: uuid().primaryKey(),
  voucherId: uuid("voucher_id").notNull(),
  accountId: uuid("account_id").notNull(),
  projectId: uuid("project_id").notNull(),
  debit: bigint({ mode: "bigint" }).notNull(),
  credit: bigint({ mode: "bigint" }).notNull(),
});
