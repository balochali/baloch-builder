import { useEffect, useState } from "react";
import { History } from "lucide-react";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { PaymentModalHeader } from "@/components/PaymentChoices";
import { PaginatedRecords } from "@/components/Pagination";
import { SavedImageGallery } from "@/components/attachments/ImageGallery";
import {
  listPartnerPaymentDocuments,
  type DocumentRecord,
} from "@/data/repositories/documentsRepository";
import {
  listPartnerContributions,
  type ProjectPartnerRow,
} from "@/data/repositories/projectPartnersRepository";
import { listPartnerPayouts } from "@/data/repositories/projectPayoutsRepository";
import { formatPKR } from "@/domain/money";
import { formatDate } from "@/lib/dates";
import type { Transaction } from "@/domain/types";
import "./project-partner-manage-dialog.css";
export function PartnerPaymentHistoryDialog({
  projectId,
  partner,
  onClose,
}: {
  projectId: string;
  partner: ProjectPartnerRow;
  onClose: () => void;
}) {
  const [rows, setRows] = useState<(Transaction & { label: string })[]>([]);
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    Promise.all([
      listPartnerContributions(projectId),
      listPartnerPayouts(projectId),
      listPartnerPaymentDocuments(projectId, partner.partner_id),
    ])
      .then(([credits, debits, docs]) => {
        if (!active) return;
        const creditRows = credits
          .filter((p) => p.partner_id === partner.partner_id)
          .map((p) => {
            let construction = false;
            try {
              construction = JSON.parse(p.custom || "{}").contribution_purpose === "construction";
            } catch {
              /* Legacy payments are land investment. */
            }
            return { ...p, label: construction ? "Construction investment" : "Land investment" };
          });
        const debitRows = debits
          .filter((p) => p.partner_id === partner.partner_id)
          .map((p) => ({
            ...p,
            label: p.payout_purpose === "capital_return" ? "Capital returned" : "Profit paid",
          }));
        setRows(
          [...creditRows, ...debitRows].sort(
            (a, b) =>
              b.date.localeCompare(a.date) ||
              b.created_at.localeCompare(a.created_at) ||
              b.id.localeCompare(a.id),
          ),
        );
        setDocuments(docs);
      })
      .catch((cause) => {
        if (active) setError(String(cause));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [projectId, partner.partner_id]);
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="partner-manage-dialog payment-modal">
        <PaymentModalHeader
          icon={History}
          eyebrow="PARTNER ACCOUNT"
          title="Payment history"
          description={`${partner.name} · Money received and paid back in this project`}
        />
        <div className="partner-manage-body">
          {loading ? (
            <p role="status">Loading payments…</p>
          ) : error ? (
            <p role="alert">Could not load payment history: {error}</p>
          ) : (
            <>
              <div className="partner-manage-summary">
                <span>
                  Received · Credit
                  <strong>
                    {formatPKR(
                      rows
                        .filter((r) => r.direction === "in")
                        .reduce((sum, r) => sum + r.amount, 0),
                    )}
                  </strong>
                </span>
                <span>
                  Paid back · Debit
                  <strong>
                    {formatPKR(
                      rows
                        .filter((r) => r.direction === "out")
                        .reduce((sum, r) => sum + r.amount, 0),
                    )}
                  </strong>
                </span>
              </div>
              {rows.length ? (
                <PaginatedRecords label="partner payments" items={rows}>
                  {(item) => (
                    <div className="partner-history-entry" key={item.id}>
                      <div>
                        <strong>{item.label}</strong>
                        <small>
                          {formatDate(item.date)} · {item.method || "Method not recorded"}
                        </small>
                        {item.reference && <small>Reference: {item.reference}</small>}
                        {item.description && <p>{item.description}</p>}
                        <SavedImageGallery
                          documents={documents.filter((d) => d.owner_id === item.id)}
                        />
                      </div>
                      <div className={item.direction === "in" ? "is-credit" : "is-debit"}>
                        <strong>{formatPKR(item.amount)}</strong>
                        <small>
                          {item.direction === "in" ? "Credit · received" : "Debit · paid back"}
                        </small>
                      </div>
                    </div>
                  )}
                </PaginatedRecords>
              ) : (
                <p>No payments recorded for this partner yet.</p>
              )}
            </>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
