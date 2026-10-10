import { usePagination } from "@/components/Pagination";
import { useEffect, useState } from "react";
import {
  Building2,
  FolderOpen,
  Search,
  ArrowUpRight,
  Files,
  Wallet,
  ReceiptText,
  ShieldCheck,
} from "lucide-react";
import { listDocuments, type DocumentRecord } from "@/data/repositories/documentsRepository";
import { DocumentPreviewCards } from "../components/DocumentPreviewCards";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  documentScopes,
  documentScope,
  projectFileTabs,
  projectFileTab,
  groupDocuments,
  type DocumentScope,
  type DocumentGroup,
  type ProjectFileTab,
} from "./documentGroups";
import "./documents-page.css";
const icons = {
  All: Files,
  Projects: Building2,
  Udhaar: Wallet,
  "Personal Expense": ReceiptText,
  "Personal Deposit": ShieldCheck,
};
export function DocumentsPage() {
  const [documents, setDocuments] = useState<DocumentRecord[]>([]),
    [tab, setTab] = useState<DocumentScope>("All"),
    [search, setSearch] = useState(""),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [selected, setSelected] = useState<DocumentGroup | null>(null);
  useEffect(() => {
    let active = true;
    listDocuments()
      .then((rows) => {
        if (active) setDocuments(rows);
      })
      .catch(() => {
        if (active) setError("Could not load documents. Reopen this page to try again.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);
  const groups = groupDocuments(documents).filter(
    (g) =>
      (tab === "All" || g.scope === tab) &&
      [g.title, ...g.documents.map((d) => [d.title, d.doc_type, d.notes].join(" "))]
        .join(" ")
        .toLowerCase()
        .includes(search.trim().toLowerCase()),
  );
  const pages = usePagination(
    groups,
    JSON.stringify([tab, search, groups.map((g) => g.id)]),
    "document collections",
  );
  return (
    <main className="documents-page documents-library">
      <header className="documents-heading">
        <span>
          <FolderOpen size={26} />
        </span>
        <div>
          <small>YOUR PROPERTY & BUSINESS RECORDS</small>
          <h1>Documents</h1>
          <p>Open a project to explore its files, or find your personal payment records.</p>
        </div>
      </header>
      <div className="documents-library-tabs" role="group" aria-label="Document categories">
        {documentScopes.map((scope) => {
          const Icon = icons[scope];
          return (
            <button
              key={scope}
              type="button"
              aria-pressed={tab === scope}
              onClick={() => {
                setTab(scope);
                setSearch("");
              }}
            >
              <Icon size={19} />
              <span>{scope}</span>
              <b>{documents.filter((d) => scope === "All" || documentScope(d) === scope).length}</b>
            </button>
          );
        })}
      </div>
      <section className="documents-panel">
        <div className="documents-panel-heading">
          <div>
            <h2>{tab === "All" ? "Your document collections" : tab}</h2>
            <p>Grouped by project and personal activity. Counts show saved files.</p>
          </div>
          <span>{groups.length} collections</span>
        </div>
        <div className="documents-search">
          <Search size={18} />
          <input
            aria-label="Search document collections"
            placeholder="Search projects, filenames or document types…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {pages.controls}
        {loading ? (
          <p role="status" className="documents-state">
            Loading documents…
          </p>
        ) : error ? (
          <p role="alert" className="documents-state">
            {error}
          </p>
        ) : groups.length ? (
          <div className="document-project-grid">
            {pages.items.map((group) => (
              <button
                type="button"
                className="document-project-card"
                  aria-label={`Open ${group.title} documents`}
                key={group.id}
                onClick={() => setSelected(group)}
              >
                <span
                  className={`document-collection-art ${group.scope === "Projects" ? "is-project" : ""}`}
                >
                  {group.scope === "Projects" ? <Building2 size={29} /> : <FolderOpen size={29} />}
                  <b>{group.documents.length} files</b>
                </span>
                <span className="document-collection-info">
                  <small>
                    {group.scope === "Projects" ? "PROJECT DOCUMENTS" : "PERSONAL & BUSINESS FILES"}
                  </small>
                  <strong>{group.title}</strong>
                  <span>
                    {group.scope === "Projects"
                      ? Array.from(new Set(group.documents.map(projectFileTab))).join(" · ")
                      : "Receipts and saved documents"}
                  </span>
                  <em>
                    Open collection <ArrowUpRight size={17} />
                  </em>
                </span>
              </button>
            ))}
          </div>
        ) : (
          <div className="documents-empty">
            <FolderOpen size={30} />
            <h3>{search ? "No matching collections" : "No documents saved here yet"}</h3>
            <p>
              {search
                ? "Try a project name or another filename."
                : "Documents will appear here when they are attached to these records."}
            </p>
          </div>
        )}
      </section>
      {selected && (
        <DocumentCollection key={selected.id} group={selected} onClose={() => setSelected(null)} />
      )}
    </main>
  );
}
function DocumentCollection({ group, onClose }: { group: DocumentGroup; onClose: () => void }) {
  const [tab, setTab] = useState<ProjectFileTab>("All"),
    [search, setSearch] = useState("");
  const documents = group.documents.filter(
    (d) =>
      (tab === "All" || projectFileTab(d) === tab) &&
      [d.title, d.doc_type, d.notes].join(" ").toLowerCase().includes(search.trim().toLowerCase()),
  );
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="document-collection-dialog">
        <DialogHeader className="document-collection-header">
          <Building2 size={25} />
          <DialogTitle>{group.title}</DialogTitle>
          <DialogDescription>
            {group.documents.length} saved files · Choose a section, then select a file to preview
            it. PDFs open in your PDF viewer.
          </DialogDescription>
        </DialogHeader>
        {group.scope === "Projects" && (
          <div
            className="document-section-tabs"
            role="group"
            aria-label="Project document sections"
          >
            {projectFileTabs.map((section) => (
              <button
                type="button"
                key={section}
                aria-pressed={tab === section}
                onClick={() => {
                  setTab(section);
                  setSearch("");
                }}
              >
                {section}
                <span>
                  {
                    group.documents.filter(
                      (d) => section === "All" || projectFileTab(d) === section,
                    ).length
                  }
                </span>
              </button>
            ))}
          </div>
        )}
        <div className="documents-search">
          <Search size={18} />
          <input
            aria-label="Search files in collection"
            placeholder="Search these files…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <p className="document-collection-count">
          {documents.length} files · {tab}
        </p>
        {documents.length ? (
          <DocumentPreviewCards documents={documents} />
        ) : (
          <p className="documents-state">No files match this section or search.</p>
        )}
      </DialogContent>
    </Dialog>
  );
}
