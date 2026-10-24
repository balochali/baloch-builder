import argon2 from "argon2";
import { fileURLToPath } from "node:url";
import { defaultSettings } from "@baloch/shared";
import { pool, transaction } from "./db";
const chart: [string, string, string][] = [
  ["1000", "Cash in Hand", "asset"],
  ["1010", "Bank Accounts", "asset"],
  ["1100", "Customer Receivables", "asset"],
  ["1150", "Advances to Contractors and Suppliers", "asset"],
  ["1200", "Development WIP: Land", "asset"],
  ["1210", "Development WIP: Land Acquisition Costs", "asset"],
  ["1220", "Development WIP: Construction Materials", "asset"],
  ["1230", "Development WIP: Contractor Costs", "asset"],
  ["1240", "Development WIP: Other Direct and Overhead Costs", "asset"],
  ["1300", "Completed Property Inventory", "asset"],
  ["2000", "Accounts Payable: Suppliers", "liability"],
  ["2010", "Contractor Payables", "liability"],
  ["2020", "Retention Payable", "liability"],
  ["2030", "Land Seller Payable", "liability"],
  ["2100", "Customer Advances", "liability"],
  ["2200", "Loans from Partners", "liability"],
  ["3000", "Partner Capital", "equity"],
  ["3100", "Partner Current Account", "equity"],
  ["3900", "Retained Earnings", "equity"],
  ["4000", "Sales of Units", "revenue"],
  ["5000", "Cost of Sales", "expense"],
  ["5100", "Sales Commission and Marketing", "expense"],
  ["5200", "Office and Administration Expenses", "expense"],
  ["5300", "Bank Charges", "expense"],
];
export async function seed(email: string, password: string) {
  if (!email.includes("@") || password.length < 12)
    throw new Error("Set ADMIN_EMAIL and ADMIN_PASSWORD (12+ characters)");
  const hash = await argon2.hash(password, { type: argon2.argon2id });
  return transaction(null, async (c) => {
    await c.query("SELECT pg_advisory_xact_lock(782106)");
    if ((await c.query("SELECT 1 FROM users LIMIT 1")).rowCount)
      throw new Error("Bootstrap requires an empty users table");
    const {
      rows: [admin],
    } = await c.query(
      "INSERT INTO users(email,password_hash,role) VALUES($1,$2,'admin') RETURNING id",
      [email.toLowerCase(), hash],
    );
    await c.query("SELECT set_config('app.actor_id',$1,true)", [admin.id]);
    await c.query("UPDATE users SET created_by=id WHERE id=$1", [admin.id]);
    for (const [code, name, type] of chart)
      await c.query(
        "INSERT INTO accounts(code,name,type,normal_balance,is_cash_bank,created_by) VALUES($1,$2,$3,$4,$5,$6)",
        [
          code,
          name,
          type,
          ["asset", "expense"].includes(type) ? "debit" : "credit",
          ["1000", "1010"].includes(code),
          admin.id,
        ],
      );
    await c.query("INSERT INTO settings(value,created_by) VALUES($1,$2)", [
      defaultSettings,
      admin.id,
    ]);
    return admin.id as string;
  });
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    await seed(process.env.ADMIN_EMAIL ?? "", process.env.ADMIN_PASSWORD ?? "");
    console.log("Admin and chart created");
  } finally {
    await pool.end();
  }
}
