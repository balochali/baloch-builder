import { AttachmentUpload } from "@/components/AttachmentUpload";
import { useEffect, useState } from "react";
import { Paperclip } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  listDocuments,
  savePartnerDocument,
  savePartnerContributionReceipt,
  savePartnerPayoutReceipt,
  type DocumentRecord,
} from "@/data/repositories/documentsRepository";
import {
  listPartnerContributions,
  type ProjectPartnerRow,
} from "@/data/repositories/projectPartnersRepository";
import { listPartnerPayouts } from "@/data/repositories/projectPayoutsRepository";

import { DocumentPreviewCards } from "@/features/documents/components/DocumentPreviewCards";
import { formatPKR } from "@/domain/money";
import "@/features/documents/pages/documents-page.css";

type Payment = { id: string; date: string; amount: number; method: string | null; payout: boolean };
export function PartnerDocuments({
  projectId,
  partner,
  expanded = false,
}: {
  projectId: string;
  partner: ProjectPartnerRow;
  expanded?: boolean;
}) {
  const [open, setOpen] = useState(expanded),
    [target, setTarget] = useState("");
  const [documents, setDocuments] = useState<DocumentRecord[]>([]),
    [payments, setPayments] = useState<Payment[]>([]);
  const [files, setFiles] = useState<File[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  useEffect(() => {
    if (!open) return;
    let active = true;
    Promise.all([
      listDocuments(),
      listPartnerContributions(projectId),
      listPartnerPayouts(projectId),
    ])
      .then(([docs, incoming, outgoing]) => {
        if (!active) return;
        const rows = [
          ...incoming.map((p) => ({ ...p, payout: false })),
          ...outgoing.map((p) => ({ ...p, payout: true })),
        ].filter((p) => p.partner_id === partner.partner_id);
        setPayments(rows);
        setDocuments(
          docs.filter(
            (d) =>
              (d.owner_type === "partnership" && d.owner_id === partner.partnership_id) ||
              (d.owner_type === "transaction" && rows.some((p) => p.id === d.owner_id)),
          ),
        );
      })
      .catch(() => {
        if (active) setError("Could not load documents. Close and reopen this section to retry.");
      });
    return () => {
      active = false;
    };
  }, [open, projectId, partner.partner_id, partner.partnership_id]);
  async function upload() {
    if (busy || !files.length) return;
    setBusy(true);
    setError("");
    setMessage("");
    const remaining = [...files];
    try {
      const payment = payments.find((p) => p.id === target);
      if (target && !payment) throw new Error("Choose an existing payment.");
      for (const file of files) {
        if (payment)
          await (payment.payout ? savePartnerPayoutReceipt : savePartnerContributionReceipt)(
            payment.id,
            file,
            payment.date,
            payment.method || "other",
          );
        else await savePartnerDocument(partner.partnership_id, file);
        remaining.shift();
        setFiles([...remaining]);
      }
      setMessage("Documents saved.");
    } catch (cause) {
      setError(`Could not save all files. Retry the remaining files: ${String(cause)}`);
    } finally {
      try {
        const docs = await listDocuments();
        setDocuments(
          docs.filter(
            (d) =>
              (d.owner_type === "partnership" && d.owner_id === partner.partnership_id) ||
              (d.owner_type === "transaction" && payments.some((p) => p.id === d.owner_id)),
          ),
        );
      } catch {
        setError("Files may be saved. Reopen this section to refresh.");
      }
      setBusy(false);
    }
  }
  return (
    <section className="rounded-xl border p-4 space-y-4 mt-4">
      {!expanded && (
        <Button type="button" variant="outline" disabled={busy} onClick={() => setOpen(!open)}>
          <Paperclip size={16} />
          {open ? "Hide" : "Receipts &"} documents
        </Button>
      )}
      {open && (
        <>
          <p className="text-sm text-muted-foreground">
            Keep agreements with this partner, or attach receipts to an existing contribution or
            payout.
          </p>
          <label className="block space-y-2">
            <span className="text-sm font-medium">Attach documents to</span>
            <select
              className="w-full rounded-lg border bg-background p-3"
              value={target}
              disabled={busy}
              onChange={(e) => setTarget(e.target.value)}
            >
              <option value="">Partner agreement / supporting documents</option>
              {payments.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.payout ? "Payout" : "Contribution"} · {p.date} · {formatPKR(p.amount)} ·{" "}
                  {p.method}
                </option>
              ))}
            </select>
          </label>
          <AttachmentUpload
            files={files}
            onChange={setFiles}
            allowPdf
            disabled={busy}
            title="Receipts & supporting documents"
            onError={setError}
          />
          {files.length > 0 && (
            <div className="flex gap-2">
              <Button disabled={busy} onClick={() => void upload()}>
                {busy ? "Uploading…" : `Save ${files.length} file(s)`}
              </Button>
              <Button variant="outline" disabled={busy} onClick={() => setFiles([])}>
                Clear selection
              </Button>
            </div>
          )}
          {message && <p role="status">{message}</p>}
          {error && (
            <p role="alert" className="text-destructive">
              {error}
            </p>
          )}
          <DocumentPreviewCards
            documents={documents.filter((d) => (target ? d.owner_id === target : true))}
          />
          {!documents.length && (
            <p className="text-sm text-muted-foreground">No documents saved yet.</p>
          )}
        </>
      )}
    </section>
  );
}
