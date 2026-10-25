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
    const existing = (
      await c.query("SELECT * FROM users WHERE email=$1 AND role='admin' AND active", [
        email.toLowerCase(),
      ])
    ).rows[0];
    if (existing && !(await argon2.verify(existing.password_hash, password)))
      throw new Error("Invalid bootstrap admin credentials");
    if (!existing && (await c.query("SELECT 1 FROM users LIMIT 1")).rowCount)
      throw new Error("Use the existing active admin credentials to seed reference data");
    const created = await c.query(
      "INSERT INTO users(email,password_hash,role) VALUES($1,$2,'admin') ON CONFLICT(email) DO NOTHING RETURNING id",
      [email.toLowerCase(), hash],
    );
    const admin = existing ?? created.rows[0];
    await c.query("SELECT set_config('app.actor_id',$1,true)", [admin.id]);
    if (!existing) await c.query("UPDATE users SET created_by=id WHERE id=$1", [admin.id]);
    for (const [code, name, type] of chart)
      await c.query(
        "INSERT INTO accounts(code,name,type,normal_balance,is_cash_bank,created_by,requires_cost_head) VALUES($1,$2,$3,$4,$5,$6,$1 IN ('1200','1210','1220','1230','1240')) ON CONFLICT(code) DO NOTHING",
        [
          code,
          name,
          type,
          ["asset", "expense"].includes(type) ? "debit" : "credit",
          ["1000", "1010"].includes(code),
          admin.id,
        ],
      );
    await c.query(
      "INSERT INTO settings(value,created_by) VALUES($1,$2) ON CONFLICT(singleton) DO NOTHING",
      [defaultSettings, admin.id],
    );
    const heads: [string, string, string | null, string | null, boolean][] = [
      ["LAND", "Land and acquisition", null, null, false],
      ["LAND-PRICE", "Land purchase price", "LAND", "1200", false],
      [
        "LAND-COSTS",
        "Acquisition costs (stamp duty, registration, commission)",
        "LAND",
        "1210",
        false,
      ],
      ["APPROVALS", "Approvals, permits and legal", null, "1240", false],
      ["DESIGN", "Design and consultancy", null, "1240", false],
      ["FOUNDATION", "Excavation and foundation", null, "1230", false],
      ["STRUCTURE", "Structure", null, "1230", false],
      ["FINISHING", "Finishing", null, "1230", false],
      ["SERVICES", "Electrical, plumbing, HVAC and elevators", null, "1230", false],
      ["LABOUR", "Labour", null, "1230", false],
      ["MATERIALS", "Materials", null, "1220", false],
      ["OVERHEADS", "Site overheads", null, "1240", false],
      ["MARKETING", "Marketing and sales", null, "5100", false],
      ["FINANCING", "Financing and bank charges", null, "5300", false],
      ["CONTINGENCY", "Contingency", null, null, true],
    ];
    for (const [sort, [code, name, parent, account, budget]] of heads.entries()) {
      if (
        (
          await c.query("SELECT 1 FROM cost_heads WHERE seed_key=$1 OR lower(code)=lower($1)", [
            code,
          ])
        ).rowCount
      )
        continue;
      await c.query(
        "INSERT INTO cost_heads(code,name,parent_id,default_account_id,budget_only,is_system,seed_key,sort_order,created_by) VALUES($1,$2,(SELECT id FROM cost_heads WHERE seed_key=$3 OR lower(code)=lower($3) ORDER BY is_system DESC LIMIT 1),(SELECT id FROM accounts WHERE code=$4),$5,true,$1,$6,$7) ON CONFLICT DO NOTHING",
        [code, name, parent, account, budget, sort, admin.id],
      );
    }
    return admin.id as string;
  });
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    await seed(process.env.ADMIN_EMAIL ?? "", process.env.ADMIN_PASSWORD ?? "");
    console.log("Admin, chart and cost heads ready (existing values preserved)");
  } finally {
    await pool.end();
  }
}
