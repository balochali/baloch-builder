import { useEffect, useState } from "react";
import { Building2, CalendarDays, FileImage, FolderOpen, HardHat, Landmark, ReceiptText, Search, Store } from "lucide-react";
import { listDocuments, openDocument, type DocumentRecord } from "@/data/repositories/documentsRepository";
import { formatDate } from "@/lib/dates";
import "./documents-page.css";

type DocumentTab = "bank" | "land" | "construction" | "sales";

const tabs = [
  { id: "bank", title: "Bank receipts", description: "Transfers, cheques and payment proof", icon: ReceiptText },
  { id: "land", title: "Land documents", description: "Land photos, maps and records", icon: Landmark },
  { id: "construction", title: "Construction receipts", description: "Supplier bills and project cost proof", icon: HardHat },
  { id: "sales", title: "Sales documents", description: "Flat and shop sale images", icon: Store },
] as const;

const paymentMethodLabels: Record<string, string> = {
  cash: "Cash receipt",
  bank: "Bank transfer receipt",
  digital: "Digital payment receipt",
  cheque: "Cheque image",
  other: "Payment receipt",
};

function categoryOf(document: DocumentRecord): DocumentTab {
  if (document.doc_type === "project_sale_document") return "sales";
  if (document.doc_type === "land_payment_receipt" || document.doc_type === "project_cost_receipt") return "bank";
  if (document.doc_type === "construction_supplier_bill" || document.doc_type === "project_cost_bill") return "construction";
  if (document.doc_type === "construction_cost_receipt")
    return ["bank", "cheque", "digital"].includes(document.notes || "") ? "bank" : "construction";
  return "land";
}

function descriptionOf(document: DocumentRecord): string {
  if (document.doc_type === "project_sale_document") return "Sale document";
  if (document.doc_type === "land_image") return "Land image";
  if (document.doc_type === "land_payment_receipt")
    return paymentMethodLabels[document.notes || ""] || "Land payment receipt";
  if (document.doc_type === "construction_cost_receipt")
    return paymentMethodLabels[document.notes || ""] || "Construction cost receipt";
  if (document.doc_type === "construction_supplier_bill") return "Supplier bill";
  if (document.doc_type === "project_cost_receipt") return paymentMethodLabels[document.notes || ""] || "Project payment receipt";
  if (document.doc_type === "project_cost_bill") return "Project cost bill";
  return document.doc_type || "Project document";
}

export function DocumentsPage() {
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [tab, setTab] = useState<DocumentTab>("bank");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [openError, setOpenError] = useState("");

  useEffect(() => {
    let active = true;
    listDocuments()
      .then((rows) => { if (active) setDocuments(rows); })
      .catch(() => { if (active) setError("Could not load documents. Reopen this page to try again."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const selectedTab = tabs.find((item) => item.id === tab)!;
  const tabDocuments = documents.filter((document) => categoryOf(document) === tab);
  const visible = tabDocuments.filter((document) =>
    [document.title, document.project_name, document.notes, descriptionOf(document)]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .includes(search.trim().toLowerCase()),
  );

  return (
    <main className="documents-page">
      <header className="documents-heading">
        <span><FolderOpen size={26} /></span>
        <div>
          <small>YOUR PROJECT FILES</small>
          <h1>Documents</h1>
          <p>Find payment proof, land images and construction receipts by project.</p>
        </div>
      </header>

      <div className="documents-tabs" role="tablist" aria-label="Document categories">
        {tabs.map(({ id, title, description, icon: Icon }) => {
          const count = documents.filter((document) => categoryOf(document) === id).length;
          return (
            <button key={id} id={`documents-tab-${id}`} type="button" role="tab" aria-selected={tab === id} aria-controls={`documents-panel-${id}`} className={`documents-tab is-${id} ${tab === id ? "is-active" : ""}`} onClick={() => { setTab(id); setSearch(""); setOpenError(""); }}>
              <span className="documents-tab-icon"><Icon size={22} /></span>
              <span className="documents-tab-copy"><strong>{title}</strong><small>{description}</small></span>
              <b>{count}</b>
            </button>
          );
        })}
      </div>

      <section id={`documents-panel-${tab}`} role="tabpanel" aria-labelledby={`documents-tab-${tab}`} className={`documents-panel is-${tab}`}>
        <div className="documents-panel-heading">
          <div><h2>{selectedTab.title}</h2><p>{selectedTab.description}. Every card shows its linked project.</p></div>
          <span>{visible.length} {visible.length === 1 ? "document" : "documents"}</span>
        </div>
        <div className="documents-search">
          <Search size={18} />
          <input aria-label={`Search ${selectedTab.title.toLowerCase()}`} placeholder="Search files, projects or payment types…" value={search} onChange={(event) => setSearch(event.target.value)} />
        </div>
        {openError && <p className="documents-open-error" role="alert">{openError}</p>}
        {loading ? (
          <p className="documents-state">Loading documents…</p>
        ) : error ? (
          <p className="documents-state" role="alert">{error}</p>
        ) : visible.length ? (
          <div className="documents-grid">
            {visible.map((document) => (
              <article className={`documents-card is-${tab}`} key={document.id}>
                <div className="documents-card-top"><span className="documents-card-icon"><FileImage size={23} /></span><span className="documents-card-kind">{descriptionOf(document)}</span></div>
                <h3>{document.title}</h3>
                <span className="documents-card-source">{document.doc_type === "project_sale_document" ? "Flat or shop sale" : document.doc_type === "construction_cost_receipt" ? "Construction payment" : document.doc_type === "construction_supplier_bill" ? "Construction supplier" : document.doc_type === "project_cost_receipt" ? "Project payment" : document.doc_type === "project_cost_bill" ? "Project supplier" : document.doc_type === "land_payment_receipt" ? "Land purchase payment" : "Land record"}</span>
                <div className="documents-card-project"><Building2 size={16} /><span><small>PROJECT</small><strong>{document.project_name || "Project not linked"}</strong></span></div>
                <div className="documents-card-date"><CalendarDays size={15} />{document.doc_date ? formatDate(document.doc_date) : "No date"}</div>
                <button type="button" disabled={!document.file_path} onClick={async () => {
                  if (!document.file_path) return;
                  try { await openDocument(document.file_path); }
                  catch { setOpenError("Could not open this image. Check that the attachments folder is available."); }
                }}>Open image →</button>
              </article>
            ))}
          </div>
        ) : (
          <div className="documents-empty">
            <FileImage size={30} />
            <h3>{search ? "No matching documents" : `No ${selectedTab.title.toLowerCase()} yet`}</h3>
            <p>{search ? "Try another filename, project or payment type." : "Images saved with a project will appear here."}</p>
          </div>
        )}
      </section>
    </main>
  );
}
