import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import { Download, Printer, Building2 } from "lucide-react";
import { LandPrintDialog } from "./LandPrintDialog";
import { LandPhotoSlider } from "./LandPhotoSlider";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { listLandDocuments, type DocumentRecord } from "@/data/repositories/documentsRepository";
import type { ProjectLand } from "@/data/repositories/projectStageRepository";
import { SavedImageGallery } from "@/components/attachments/ImageGallery";
import { formatPKR } from "@/domain/money";
import { formatDate } from "@/lib/dates";

export function LandDetailsDialog({
  land,
  onClose,
}: {
  land: ProjectLand & { projectId: string; projectName: string };
  onClose: () => void;
}) {
  const [printing, setPrinting] = useState(false);
  const [downloading, setDownloading] = useState<string | null>(null);
  async function download(doc: DocumentRecord) {
    if (!doc.file_path || downloading) return;
    setDownloading(doc.id);
    try {
      const path = await invoke<string>("download_attachment", {
        path: doc.file_path,
        filename: `${land.projectName}-${doc.title}`,
      });
      toast.success("Document saved to Downloads", { description: path });
    } catch {
      toast.error("Could not download this document. Please try again.");
    } finally {
      setDownloading(null);
    }
  }
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"details" | "payment">("details");
  useEffect(() => {
    let active = true;
    listLandDocuments(land.id)
      .then((rows) => {
        if (active) setDocuments(rows);
      })
      .catch(() => {
        if (active) setError("Could not load land documents. Close and reopen to retry.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [land.id]);
  const payment = land.payment_details;
  const methods = {
    cash: "Cash",
    bank: "Bank transfer",
    digital: "Digital wallet",
    cheque: "Cheque",
    other: "Other",
  };
  const files = documents.filter((doc) =>
    tab === "payment"
      ? doc.doc_type === "land_payment_receipt" && !doc.mime?.startsWith("image/")
      : doc.doc_type !== "land_payment_receipt" && !doc.mime?.startsWith("image/"),
  );
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="land-details-dialog" aria-describedby={undefined}>
        <DialogHeader className="land-modal-hero">
          <Building2 size={26} />
          <small>{land.projectName}</small>
          <DialogTitle>{land.title}</DialogTitle>
        </DialogHeader>
        <nav className="land-detail-tabs" aria-label="Land information">
          {(["details", "payment"] as const).map((item) => (
            <button
              type="button"
              key={item}
              aria-pressed={tab === item}
              onClick={() => setTab(item)}
            >
              {item === "details" ? "Land details" : "Payment & receipts"}
            </button>
          ))}
        </nav>
        {tab === "details" ? (
          <div className="land-detail-body land-detail-overview">
            <LandPhotoSlider landId={land.id} title={land.title} />
            <dl>
              <div>
                <dt>Location</dt>
                <dd>{land.location}</dd>
              </div>
              <div>
                <dt>Acquired</dt>
                <dd>{formatDate(land.purchase_date)}</dd>
              </div>
              <div>
                <dt>Area</dt>
                <dd>
                  {land.area_value === null
                    ? "Not recorded"
                    : `${land.area_value.toLocaleString()} ${land.area_unit}`}
                </dd>
              </div>
              <div>
                <dt>Seller</dt>
                <dd>{land.seller_name || "Not recorded"}</dd>
              </div>
              <div>
                <dt>Purchase price</dt>
                <dd>{land.price === null ? "Not recorded" : formatPKR(land.price)}</dd>
              </div>
            </dl>
            {land.notes && <p>{land.notes}</p>}
          </div>
        ) : (
          <div className="land-detail-body land-payment-overview">
            <LandPhotoSlider
              key="receipts"
              landId={land.id}
              title={`${land.title} receipts`}
              documentType="land_payment_receipt"
            />
            <div className="land-payment-summary">
              {tab === "payment" && (
                <>
                  <div className="land-payment-highlight">
                    <small>Purchase payment</small>
                    <strong>{land.price === null ? "Not recorded" : formatPKR(land.price)}</strong>
                    <span>{payment ? methods[payment.method] : "Method not recorded"}</span>
                  </div>
                  <dl>
                    <div>
                      <dt>Paid from</dt>
                      <dd>
                        {land.account_key === "builder"
                          ? "Builder Account"
                          : land.account_key === "personal"
                            ? "Personal Account"
                            : "Not recorded"}
                      </dd>
                    </div>
                    <div>
                      <dt>Payment method</dt>
                      <dd>{payment ? methods[payment.method] : "Not recorded"}</dd>
                    </div>
                    {payment &&
                      Object.entries({
                        "Paid to": payment.paid_to,
                        "Bank / provider": payment.provider,
                        "Account name": payment.account_name,
                        "Account / IBAN": payment.account_no,
                        "Reference / cheque number": payment.reference,
                        "Cheque date": payment.cheque_date,
                      })
                        .filter(([, value]) => value)
                        .map(([label, value]) => (
                          <div key={label}>
                            <dt>{label}</dt>
                            <dd>{value}</dd>
                          </div>
                        ))}
                  </dl>
                </>
              )}
            </div>
          </div>
        )}
        {(files.length > 0 || error) && (
          <section className="land-modal-documents">
            <h3>
              {tab === "payment"
                ? `${payment ? methods[payment.method] : "Payment"} receipts`
                : "Land documents"}
            </h3>
            <p>Images open in preview. PDFs open in your PDF viewer.</p>
            {loading ? (
              <p role="status">Loading documents…</p>
            ) : error ? (
              <p role="alert">{error}</p>
            ) : files.length ? (
              <>
                <SavedImageGallery documents={files} />
                <div className="land-download-actions">
                  {files.map((doc) => (
                    <button
                      type="button"
                      key={doc.id}
                      disabled={!!downloading || !doc.file_path}
                      onClick={() => void download(doc)}
                    >
                      <Download size={16} />
                      <span>
                        {downloading === doc.id ? "Downloading…" : `Download ${doc.title}`}
                      </span>
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <p>No {tab === "payment" ? "payment receipts" : "land documents"} saved yet.</p>
            )}
          </section>
        )}
        <footer className="land-modal-actions">
          <button type="button" onClick={() => setPrinting(true)}>
            <Printer size={18} /> Print / Save details as PDF
          </button>
          <Link className="land-project-button" to={`/projects/${land.projectId}`}>
            <Building2 size={18} /> Open project to update land
          </Link>
        </footer>
        {printing && <LandPrintDialog land={land} onClose={() => setPrinting(false)} />}
      </DialogContent>
    </Dialog>
  );
}
