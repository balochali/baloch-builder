import { useRef, useState } from "react";
import { format } from "date-fns";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { SalePaymentFields, newSalePayment, paymentInput } from "./SalePaymentForm";
import { SalePaymentSchema } from "@/data/repositories/salePaymentsRepository";
import { addSaleRefund, type SaleEvent } from "@/data/repositories/saleEventsRepository";
import { formatPKR } from "@/domain/money";
export function SaleRefundDialog({
  event,
  onClose,
  onSaved,
}: {
  event: SaleEvent;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [draft, setDraft] = useState(() => newSalePayment(format(new Date(), "yyyy-MM-dd")));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  async function save() {
    if (lock.current) return;
    const parsed = SalePaymentSchema.safeParse(paymentInput(draft));
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check payment details");
      return;
    }
    if (parsed.data.amount > event.refund - event.refunded || parsed.data.date < event.date) {
      setError("Refund must not exceed the remaining balance or predate cancellation.");
      return;
    }
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await addSaleRefund(event, parsed.data);
      onSaved();
      onClose();
    } catch (cause) {
      setError(String(cause));
    } finally {
      lock.current = false;
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
      <DialogContent className="project-sale-dialog">
        <DialogHeader>
          <DialogTitle>Record refund</DialogTitle>
          <p>{event.buyer_name}</p>
          <p>
            Remaining refund: <strong>{formatPKR(event.refund - event.refunded)}</strong>
          </p>
        </DialogHeader>
        <div className="project-sale-dialog-body">
          <SalePaymentFields direction="out" value={draft} onChange={setDraft} disabled={busy} />
          {error && (
            <p role="alert" className="project-sale-error">
              {error}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={busy} onClick={() => void save()}>
            {busy ? "Saving…" : "Save refund"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
