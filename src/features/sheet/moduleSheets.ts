import type { SheetRow } from "./SheetGrid";
import {
  col,
  date,
  iso,
  money,
  num,
  projectSheets,
  row,
  whole,
  type ProjectSheet,
} from "./projectSheets";
import { parseAccount, parseMethod } from "./sheetParsing";
import {
  archiveContact,
  createContact,
  listContacts,
  updateContact,
} from "@/data/repositories/contactsRepository";
import { createProject, listProjects } from "@/data/repositories/projectsRepository";
import { updateSheetProject } from "@/data/repositories/projectSheetRepository";
import {
  ExpenseCategories,
  archivePersonalExpense,
  createPersonalExpense,
  listPersonalExpenses,
  updatePersonalExpense,
} from "@/data/repositories/personalExpenseRepository";
import {
  createUdhaar,
  listAllUdhaarPayments,
  listUdhaars,
} from "@/data/repositories/udhaarRepository";
import {
  archiveUdhaar,
  deleteSheetDeposit,
  listAllDepositReturns,
  updateSheetUdhaar,
} from "@/data/repositories/sheetRecordsRepository";
import {
  listPersonalDeposits,
  savePersonalDeposit,
} from "@/data/repositories/personalDepositsRepository";
import { listBankEntries } from "@/data/repositories/bankRepository";
import { accountName } from "@/domain/bankAccount";

const text = (c: Record<string, string>, key: string) => (c[key] ?? "").trim();
const account = col("account_key", "Paid from", {
  options: ["personal", "builder"],
  required: true,
  width: 110,
});

/* ---------------------------------------------------------------- Contacts */
export const contactsSheets = (): ProjectSheet[] => [
  {
    id: "contacts",
    label: "Contacts",
    help: "Everyone you deal with. Change a box to correct it, or add a new person at the bottom.",
    columns: [
      col("name", "Name", { required: true, width: 200 }),
      col("phone", "Phone"),
      col("phone2", "Second phone"),
      col("address", "Address", { width: 240 }),
      col("notes", "Notes", { width: 240 }),
    ],
    load: async () => (await listContacts()).map((c) => row(c.id, { ...c })),
    save: async (c, id) => {
      const input = {
        name: text(c, "name"),
        phone: text(c, "phone"),
        phone2: text(c, "phone2"),
        address: text(c, "address"),
        notes: text(c, "notes"),
      };
      if (id) {
        await updateContact({ id, ...input });
        return id;
      }
      return (await createContact(input)).id;
    },
    remove: archiveContact,
  },
];

/* ---------------------------------------------------------------- Projects */
const projectsOnly = (): ProjectSheet => {
  const load = async () => (await listProjects()).map((p) => row(p.id, { ...p, stage: p.status }));
  return {
    id: "projects",
    label: "Projects",
    help: "All your projects. Change the stage of a project from its own page. Projects cannot be deleted here.",
    columns: [
      col("name", "Project name", { required: true, width: 200 }),
      col("location", "Location", { required: true, width: 240 }),
      col("code", "Code", { width: 100 }),
      date("start_date", "Start date"),
      col("description", "Notes", { width: 260 }),
      col("stage", "Stage", { readOnly: true, width: 150 }),
    ],
    load,
    save: async (c, id) => {
      const input = {
        name: text(c, "name"),
        location: text(c, "location"),
        code: text(c, "code"),
        description: text(c, "description"),
        status: "planning" as const,
        start_date: iso(c.start_date, true),
      };
      if (id) {
        await updateSheetProject(id, input);
        return id;
      }
      const taken = (await listProjects()).some(
        (p) => p.name.trim().toLowerCase() === input.name.toLowerCase(),
      );
      if (taken) throw new Error("A project with this name already exists. Use a different name.");
      return (await createProject(input)).id;
    },
  };
};

/** The same sheet as inside a project, but for all projects together (with a Project column). */
export function acrossProjects(
  templateId: string,
  options: { id?: string; label?: string; help?: string } = {},
): ProjectSheet {
  const template = (projectId: string) => {
    const found = projectSheets(projectId).find((s) => s.id === templateId);
    if (!found) throw new Error(`Unknown sheet ${templateId}`);
    return found;
  };
  const base = template("template");
  const owner = new Map<string, string>();
  return {
    ...base,
    id: options.id ?? templateId,
    label: options.label ?? base.label,
    help: options.help ?? base.help,
    singleton: false,
    upload: undefined,
    columns: [col("project", "Project", { required: true, width: 200 }), ...base.columns],
    load: async () => {
      owner.clear();
      const out: SheetRow[] = [];
      for (const project of await listProjects()) {
        for (const r of await template(project.id).load()) {
          owner.set(r.id, project.id);
          out.push({ ...r, cells: { project: project.name, ...r.cells } });
        }
      }
      return out;
    },
    save: async (cells, id) => {
      const projects = await listProjects();
      const name = text(cells, "project").toLowerCase();
      const matches = projects.filter((p) => p.name.trim().toLowerCase() === name);
      if (!name) throw new Error("Project: type the project name");
      if (matches.length !== 1)
        throw new Error(
          matches.length
            ? "Two projects have this name. Rename one first."
            : "Project not found. Spell it exactly like on the Projects page.",
        );
      const known = id ? owner.get(id) : undefined;
      if (id && known !== matches[0].id)
        throw new Error("A record cannot be moved to another project. Delete it and add it again.");
      const { project: _project, ...rest } = cells;
      void _project;
      const saved = await template(matches[0].id).save(rest, id);
      owner.set(saved, matches[0].id);
      return saved;
    },
    remove: base.remove
      ? async (id) => {
          const projectId = owner.get(id);
          if (!projectId) throw new Error("Press Refresh and try again.");
          await template(projectId).remove?.(id);
        }
      : undefined,
  };
}

export const projectsPageSheets = (): ProjectSheet[] => [
  projectsOnly(),
  acrossProjects("sales", {
    id: "sales",
    label: "Flats & shops sold",
    help: "Every flat and shop sold, in all projects.",
  }),
  acrossProjects("construction_cost", { label: "Construction costs" }),
  acrossProjects("project_cost", { label: "Other costs" }),
  acrossProjects("estimates", { label: "Estimates" }),
];

export const landPageSheets = (): ProjectSheet[] => [
  acrossProjects("land", {
    label: "Land",
    help: "All land you bought, one row per project. To add land, type the project name (it must still be at Planning).",
  }),
  acrossProjects("land_sales", { label: "Land sold" }),
];

export const partnersPageSheets = (): ProjectSheet[] => [
  acrossProjects("partners", { label: "Partners in projects" }),
  acrossProjects("contributions", { label: "Money received" }),
  acrossProjects("payouts", { label: "Money paid out" }),
];

export const documentsPageSheets = (): ProjectSheet[] => [
  acrossProjects("documents", {
    label: "Project documents",
    help: "Change a document's name, date or notes. Use Open file to see it. To add a file, open its project, choose Sheet view, then Documents and Attach file.",
  }),
];

/* ---------------------------------------------------------------- Expenses */
const expenseRows = async () =>
  (await listPersonalExpenses()).map((e) =>
    row(e.id, {
      ...e,
      method: e.payment_details?.method,
      received_by: e.payment_details?.received_by,
      provider: e.payment_details?.provider,
      pay_account: e.payment_details?.account,
      reference: e.payment_details?.reference,
    }),
  );
export const expenseSheets = (): ProjectSheet[] => [
  {
    id: "expenses",
    label: "Personal expenses",
    help: "Things you bought for yourself. Category: car, watch, land, house or other.",
    columns: [
      date("purchase_date", "Date"),
      col("category", "Category", { options: [...ExpenseCategories], required: true, width: 110 }),
      col("item_name", "What you bought", { required: true, width: 220 }),
      money("amount", "Amount (Rs)"),
      account,
      col("method", "How paid", {
        options: ["cash", "bank", "digital", "cheque", "other"],
        width: 110,
      }),
      col("received_by", "Paid to"),
      col("provider", "Bank / service"),
      col("pay_account", "Account no."),
      col("reference", "Receipt / reference"),
      col("notes", "Notes", { width: 220 }),
    ],
    load: expenseRows,
    save: async (c, id) => {
      const category = text(c, "category").toLowerCase();
      if (!(ExpenseCategories as readonly string[]).includes(category))
        throw new Error("Category: write car, watch, land, house or other");
      const detailed = ["received_by", "provider", "pay_account", "reference"].some((k) =>
        text(c, k),
      );
      const method = parseMethod(c.method ?? "");
      const input = {
        account_key: parseAccount(c.account_key ?? ""),
        payment_details:
          detailed || method !== "cash"
            ? {
                method,
                received_by: text(c, "received_by"),
                provider: text(c, "provider"),
                account: text(c, "pay_account"),
                reference: text(c, "reference"),
              }
            : undefined,
        category: category as (typeof ExpenseCategories)[number],
        item_name: text(c, "item_name"),
        amount: whole(c, "amount") ?? 0,
        purchase_date: iso(c.purchase_date),
        notes: text(c, "notes"),
      };
      if (id) {
        await updatePersonalExpense(id, input);
        return id;
      }
      return createPersonalExpense(input);
    },
    remove: archivePersonalExpense,
  },
];

/* ------------------------------------------------------------------ Udhaar */
const udhaarRows = async () =>
  (await listUdhaars()).map((u) =>
    row(u.id, {
      ...u,
      remaining: u.amount - u.paid_amount,
      from_contacts: u.contact_id ? "Yes" : "No",
    }),
  );
export const udhaarSheets = (): ProjectSheet[] => [
  {
    id: "udhaar",
    label: "Money given (Udhaar)",
    help: "Money you lent to people. “Paid back” and “Still to get” are worked out by the software from the payments you record on the page.",
    columns: [
      col("borrower_name", "Person", { required: true, width: 190 }),
      col("phone", "Phone"),
      money("amount", "Amount (Rs)"),
      date("given_date", "Date given"),
      date("due_date", "Due date"),
      { ...account, label: "Given from" },
      col("notes", "Notes", { width: 220 }),
      { ...num("paid_amount", "Paid back (Rs)", { sum: true }), readOnly: true },
      { ...num("remaining", "Still to get (Rs)", { sum: true }), readOnly: true },
      col("from_contacts", "Person from Contacts", { readOnly: true, width: 130 }),
    ],
    load: udhaarRows,
    save: async (c, id) => {
      const input = {
        account_key: parseAccount(c.account_key ?? ""),
        contact_id: null,
        borrower_name: text(c, "borrower_name"),
        phone: text(c, "phone"),
        amount: whole(c, "amount") ?? 0,
        given_date: iso(c.given_date),
        due_date: iso(c.due_date, true) || null,
        notes: text(c, "notes"),
      };
      if (id) {
        const current = (await listUdhaars()).find((u) => u.id === id);
        if (
          current?.contact_id &&
          (current.borrower_name !== input.borrower_name || (current.phone ?? "") !== input.phone)
        )
          throw new Error(
            "This person comes from Contacts. Change their name or phone in Contacts.",
          );
        await updateSheetUdhaar(id, input);
        return id;
      }
      return createUdhaar(input);
    },
    remove: archiveUdhaar,
  },
  {
    id: "udhaar_payments",
    label: "Payments received",
    readOnly: true,
    help: "Money people paid back. To add a payment, use the Udhaar page.",
    columns: [
      col("person", "Person", { width: 190 }),
      date("paid_date", "Date"),
      money("amount", "Amount (Rs)"),
      col("method", "How paid"),
      col("notes", "Notes", { width: 240 }),
    ],
    load: async () => {
      const names = new Map((await listUdhaars()).map((u) => [u.id, u.borrower_name]));
      return (await listAllUdhaarPayments()).map((p) =>
        row(p.id, { ...p, person: names.get(p.udhaar_id) ?? "" }),
      );
    },
    save: async () => {
      throw new Error("Read only");
    },
  },
];

/* ---------------------------------------------------------------- Deposits */
const depositRows = async () =>
  (await listPersonalDeposits()).map((d) =>
    row(d.id, { ...d, still_held: d.amount - d.returned_amount }),
  );
export const depositSheets = (): ProjectSheet[] => [
  {
    id: "deposits",
    label: "Money kept with others (Amanat)",
    help: "Money you left with someone for safekeeping. A deposit that already has money returned cannot be deleted.",
    columns: [
      col("holder_name", "Person", { required: true, width: 190 }),
      col("phone", "Phone"),
      money("amount", "Amount (Rs)"),
      date("deposit_date", "Date"),
      col("source", "Source", { options: ["savings", "partner", "other"], width: 100 }),
      col("source_details", "Source details", { width: 200 }),
      col("reason", "Reason", { width: 200 }),
      { ...account, label: "Kept in" },
      col("method", "How paid", {
        options: ["cash", "bank", "digital", "cheque", "other"],
        width: 110,
      }),
      { ...num("returned_amount", "Returned (Rs)", { sum: true }), readOnly: true },
      { ...num("still_held", "Still with holder (Rs)", { sum: true }), readOnly: true },
    ],
    load: depositRows,
    save: async (c, id) => {
      const source = text(c, "source").toLowerCase() || "savings";
      if (!["savings", "partner", "other"].includes(source))
        throw new Error("Source: write savings, partner or other");
      const existing = id ? (await listPersonalDeposits()).find((d) => d.id === id) : undefined;
      const account_key = parseAccount(c.account_key ?? "");
      if (!account_key) throw new Error("Kept in: write Personal or Builder");
      const input = {
        holder_name: text(c, "holder_name"),
        phone: text(c, "phone"),
        amount: whole(c, "amount") ?? 0,
        deposit_date: iso(c.deposit_date),
        source: source as "savings" | "partner" | "other",
        source_details: text(c, "source_details"),
        reason: text(c, "reason"),
        account_key,
        method: parseMethod(c.method ?? ""),
        payment_details: existing?.payment_details ?? null,
      };
      return savePersonalDeposit(input, id);
    },
    remove: deleteSheetDeposit,
  },
  {
    id: "deposit_returns",
    label: "Money returned to you",
    readOnly: true,
    help: "Money returned to you. To add a return, use the Amanat page.",
    columns: [
      col("holder_name", "Person", { width: 190 }),
      date("return_date", "Date"),
      money("amount", "Amount (Rs)"),
      col("account_key", "Paid from"),
      col("method", "How paid"),
      col("notes", "Notes", { width: 240 }),
    ],
    load: async () => (await listAllDepositReturns()).map((r) => row(r.id, { ...r })),
    save: async () => {
      throw new Error("Read only");
    },
  },
];

/* -------------------------------------------------------------------- Bank */
export const bankSheets = (): ProjectSheet[] => [
  {
    id: "bank",
    label: "All money in and out",
    readOnly: true,
    help: "Every payment in the software, newest first. This list is made automatically, so change a payment on the page where it was entered.",
    columns: [
      date("date", "Date"),
      col("flow", "In / Out", { width: 100 }),
      money("amount", "Amount (Rs)"),
      col("account", "Account", { width: 130 }),
      col("category", "What for", { width: 170 }),
      col("person", "Person", { width: 170 }),
      col("description", "Details", { width: 240 }),
      col("method", "How paid", { width: 110 }),
      col("project", "Project", { width: 170 }),
    ],
    load: async () =>
      (await listBankEntries()).map((e) =>
        row(e.id, {
          ...e,
          flow: e.direction === "in" ? "Money in" : "Money out",
          account: accountName(e.account_key),
        }),
      ),
    save: async () => {
      throw new Error("Read only");
    },
  },
];
