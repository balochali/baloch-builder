import type { DocumentRecord } from "@/data/repositories/documentsRepository";
export const documentScopes = [
  "All",
  "Projects",
  "Udhaar",
  "Personal Expense",
  "Personal Deposit",
] as const;
export const projectFileTabs = [
  "All",
  "Land",
  "Construction",
  "Partners",
  "Sales",
  "Other",
] as const;
export type DocumentScope = (typeof documentScopes)[number];
export type ProjectFileTab = (typeof projectFileTabs)[number];
export function documentScope(d: DocumentRecord): Exclude<DocumentScope, "All"> | "Other" {
  const owner = d.owner_type || "",
    type = d.doc_type || "";
  if (["personal_deposit", "deposit_return"].includes(owner) || type.startsWith("amanat_"))
    return "Personal Deposit";
  if (owner.startsWith("udhaar") || type.startsWith("udhaar")) return "Udhaar";
  if (owner.startsWith("personal_expense") || type.startsWith("personal_expense"))
    return "Personal Expense";
  return d.project_id || d.project_name ? "Projects" : "Other";
}
export function projectFileTab(d: DocumentRecord): ProjectFileTab {
  const type = d.doc_type || "";
  if (d.owner_type === "project_sale") return "Sales";
  if (d.owner_type === "land" || type.startsWith("land_")) return "Land";
  if (type.startsWith("construction_") || type.startsWith("project_cost")) return "Construction";
  if (type.startsWith("partner_")) return "Partners";
  if (d.owner_type === "project_sale" || type.startsWith("project_sale")) return "Sales";
  return "Other";
}
export interface DocumentGroup {
  id: string;
  title: string;
  scope: Exclude<DocumentScope, "All"> | "Other";
  documents: DocumentRecord[];
}
export function groupDocuments(documents: DocumentRecord[]): DocumentGroup[] {
  const groups = new Map<string, DocumentGroup>();
  for (const d of documents) {
    const scope = documentScope(d);
    const id = scope === "Projects" ? `project:${d.project_id || d.project_name}` : scope;
    let group = groups.get(id);
    if (!group) {
      group = {
        id,
        title:
          scope === "Projects"
            ? d.project_name || "Project"
            : scope === "Other"
              ? "Other documents"
              : scope,
        scope,
        documents: [],
      };
      groups.set(id, group);
    }
    group.documents.push(d);
  }
  return Array.from(groups.values()).sort((a, b) => a.title.localeCompare(b.title));
}
