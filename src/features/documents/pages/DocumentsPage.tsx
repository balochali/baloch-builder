import { useEffect, useState } from "react";
import { FileImage, FolderOpen, Search } from "lucide-react";
import {
  listDocuments,
  openDocument,
  type DocumentRecord,
} from "@/data/repositories/documentsRepository";
import { formatDate } from "@/lib/dates";
import "./documents-page.css";

const paymentMethodLabels: Record<string, string> = {
  cash: "Cash payment",
  bank: "Bank transfer",
  digital: "Digital payment",
  cheque: "Cheque",
  other: "Payment",
};

export function DocumentsPage() {
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
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
  const visible = documents.filter((document) =>
    [document.title, document.project_name, document.notes]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .includes(search.trim().toLowerCase()),
  );
  return (
    <main className="documents-page">
      <header className="documents-heading">
        <span>
          <FolderOpen size={24} />
        </span>
        <div>
          <h1>Documents</h1>
          <p>Images and files saved with your business records.</p>
        </div>
      </header>
      <div className="documents-search">
        <Search size={18} />
        <input
          aria-label="Search documents"
          placeholder="Search documents or projects…"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>
      {loading ? (
        <p>Loading documents…</p>
      ) : error ? (
        <p role="alert">{error}</p>
      ) : visible.length ? (
        <div className="documents-grid">
          {visible.map((document) => (
            <article className="documents-card" key={document.id}>
              <span>
                <FileImage size={25} />
              </span>
              <div>
                <h2>{document.title}</h2>
                <p>
                  {document.project_name || "Document"} ·{" "}
                  {document.doc_date ? formatDate(document.doc_date) : "No date"}
                </p>
                <small>
                  {document.doc_type === "land_image"
                    ? "Land image"
                    : document.doc_type === "land_payment_receipt"
                      ? `${paymentMethodLabels[document.notes || ""] || "Payment"} receipt`
                    : document.doc_type === "construction_cost_receipt"
                      ? "Construction cost receipt"
                    : document.doc_type || "Attachment"}
                </small>
              </div>
              <button
                type="button"
                onClick={async () => {
                  if (!document.file_path) return;
                  try {
                    await openDocument(document.file_path);
                  } catch {
                    setError(
                      "Could not open this image. Check that the attachments folder is available.",
                    );
                  }
                }}
              >
                Open image
              </button>
            </article>
          ))}
        </div>
      ) : (
        <div className="documents-empty">
          <FileImage size={30} />
          <h2>{search ? "No matching documents" : "No documents saved yet"}</h2>
          <p>
            {search
              ? "Try another name or project."
              : "Images added during land acquisition will appear here."}
          </p>
        </div>
      )}
    </main>
  );
}
