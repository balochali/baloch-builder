import { useEffect, useRef, useState } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Printer } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  listLandDocuments,
  readDocumentImage,
  openDocument,
  type DocumentRecord,
} from "@/data/repositories/documentsRepository";
import type { ProjectLand } from "@/data/repositories/projectStageRepository";
import { formatPKR } from "@/domain/money";
import { formatDate } from "@/lib/dates";
import "@/features/projects/components/project-print.css";
type Land = ProjectLand & { projectName: string };
const kind = (doc: DocumentRecord) =>
  doc.doc_type === "land_payment_receipt" ? "Payment receipt" : "Land document";
export function LandPrintDialog({ land, onClose }: { land: Land; onClose: () => void }) {
  const [documents, setDocuments] = useState<DocumentRecord[]>([]),
    [ids, setIds] = useState<string[]>([]);
  const [details, setDetails] = useState(true),
    [payment, setPayment] = useState(false),
    [busy, setBusy] = useState(true),
    [error, setError] = useState(""),
    [html, setHtml] = useState(""),
    [ready, setReady] = useState(false);
  const frame = useRef<HTMLIFrameElement>(null),
    urls = useRef<string[]>([]);
  useEffect(() => {
    let active = true;
    listLandDocuments(land.id)
      .then((rows) => {
        if (active) setDocuments(rows);
      })
      .catch(() => {
        if (active) setError("Could not load documents. Close and retry.");
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
      urls.current.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [land.id]);
  async function prepare() {
    setBusy(true);
    setError("");
    setReady(false);
    const loaded: { doc: DocumentRecord; url: string }[] = [];
    try {
      for (const doc of documents.filter((d) => ids.includes(d.id))) {
        const url = await readDocumentImage(doc);
        urls.current.push(url);
        loaded.push({ doc, url });
      }
      const p = land.payment_details;
      const rows = [
        ...(details
          ? [
              ["Location", land.location],
              ["Acquired", formatDate(land.purchase_date)],
              ["Area", `${land.area_value ?? "—"} ${land.area_unit ?? ""}`],
              ["Seller", land.seller_name],
              ["Purchase price", land.price === null ? "Not recorded" : formatPKR(land.price)],
              ["Notes", land.notes],
            ]
          : []),
        ...(payment
          ? [
              ["Paid from", land.account_key || "Not recorded"],
              ["Method", p?.method],
              ["Paid to", p?.paid_to],
              ["Bank / provider", p?.provider],
              ["Account name", p?.account_name],
              ["Account / IBAN", p?.account_no],
              ["Reference / cheque", p?.reference],
              ["Cheque date", p?.cheque_date],
            ]
          : []),
      ];
      setHtml(
        "<!doctype html>" +
          renderToStaticMarkup(
            <html>
              <head>
                <title>{land.projectName} — Land documents</title>
                <style>{`@page{size:A4;margin:16mm}body{font:11pt/1.5 Arial,sans-serif;color:#172d3c;margin:0}header{border-bottom:2px solid #b89046;padding-bottom:12px}h1{font-size:23pt}h2{font-size:16pt}p,td{overflow-wrap:anywhere;white-space:pre-wrap}table{border-collapse:collapse;width:100%}td{padding:9px;border:1px solid #ccc}td:first-child{width:30%;font-weight:bold}tr{break-inside:avoid}.document{break-before:page}.document img{display:block;max-width:100%;max-height:220mm;margin:15px auto;object-fit:contain}@media screen{body{max-width:180mm;margin:auto;padding:25px}.document{margin-top:30px;border-top:1px dashed #bbb}}`}</style>
              </head>
              <body>
                <header>
                  BALOCH BUILDERS & DEVELOPERS
                  <br />
                  Project: {land.projectName} · Property: {land.title}
                </header>
                {rows.length > 0 && (
                  <>
                    <h1>
                      {details && payment
                        ? "Land & payment details"
                        : details
                          ? "Land details"
                          : "Payment details"}
                    </h1>
                    <table>
                      <tbody>
                        {rows.map(([label, value], i) => (
                          <tr key={i}>
                            <td>{label}</td>
                            <td>{value || "Not recorded"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </>
                )}
                {loaded.map(({ doc, url }, i) => (
                  <section className={rows.length || i ? "document" : ""} key={doc.id}>
                    <h2>
                      {kind(doc)} · {i + 1} of {loaded.length}
                    </h2>
                    <p>
                      Project: {land.projectName}
                      <br />
                      Property: {land.title}
                      <br />
                      File: {doc.title}
                      {doc.doc_date ? ` · ${formatDate(doc.doc_date)}` : ""}
                    </p>
                    <img src={url} alt={doc.title} />
                  </section>
                ))}
              </body>
            </html>,
          ),
      );
    } catch {
      setError(
        "A selected image could not be loaded. Retry or deselect it; no incomplete report has been printed.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <DialogContent className={`project-print-dialog ${html ? "has-preview" : ""}`}>
        <DialogHeader>
          <DialogTitle>
            <Printer size={22} /> Print land documents
          </DialogTitle>
          <DialogDescription>
            {land.projectName} · {land.title}. Choose details and images; each document is labeled
            and starts on its own A4 page.
          </DialogDescription>
        </DialogHeader>
        {html ? (
          <iframe
            ref={frame}
            title="Land print preview"
            srcDoc={html}
            onLoad={async () => {
              const images = Array.from(frame.current?.contentDocument?.images || []);
              await Promise.all(
                images.map((img) =>
                  img.decode().catch(() => {
                    throw new Error("Image unavailable");
                  }),
                ),
              )
                .then(() => setReady(true))
                .catch(() => setError("An image could not be displayed. Go back and retry."));
            }}
          />
        ) : (
          <fieldset disabled={busy} className="land-print-options">
            <label>
              <input
                type="checkbox"
                checked={details}
                onChange={(e) => setDetails(e.target.checked)}
              />{" "}
              Land details & purchase summary
            </label>
            <label>
              <input
                type="checkbox"
                checked={payment}
                onChange={(e) => setPayment(e.target.checked)}
              />{" "}
              Payment details
            </label>
            <h3>Saved documents</h3>
            {busy ? (
              <p role="status">Loading…</p>
            ) : documents.length === 0 ? (
              <p>No documents saved yet.</p>
            ) : (
              documents.map((doc) =>
                doc.mime?.startsWith("image/") ? (
                  <label key={doc.id}>
                    <input
                      type="checkbox"
                      checked={ids.includes(doc.id)}
                      onChange={(e) =>
                        setIds((current) =>
                          e.target.checked
                            ? [...current, doc.id]
                            : current.filter((id) => id !== doc.id),
                        )
                      }
                    />
                    <span>
                      {doc.title}
                      <small>{kind(doc)}</small>
                    </span>
                  </label>
                ) : (
                  <div key={doc.id}>
                    <strong>{doc.title}</strong>
                    <p>PDF document — open and print from your PDF viewer.</p>
                    <Button
                      variant="outline"
                      disabled={!doc.file_path}
                      onClick={() =>
                        void openDocument(doc.file_path!).catch(() =>
                          setError("Could not open this PDF."),
                        )
                      }
                    >
                      Open PDF to print
                    </Button>
                  </div>
                ),
              )
            )}
          </fieldset>
        )}
        {error && <p role="alert">{error}</p>}
        <div className="project-print-actions">
          {html ? (
            <>
              <Button
                variant="outline"
                onClick={() => {
                  setHtml("");
                  setReady(false);
                  urls.current.forEach((url) => URL.revokeObjectURL(url));
                  urls.current = [];
                }}
              >
                Change selection
              </Button>
              <Button
                disabled={!ready}
                onClick={() => {
                  try {
                    frame.current?.contentWindow?.focus();
                    frame.current?.contentWindow?.print();
                  } catch {
                    setError("Could not open the print dialog.");
                  }
                }}
              >
                Print / Save PDF
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" disabled={busy} onClick={onClose}>
                Cancel
              </Button>
              <Button
                disabled={busy || (!details && !payment && !ids.length)}
                onClick={() => void prepare()}
              >
                Preview report
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
