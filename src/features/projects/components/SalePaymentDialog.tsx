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
import {
  addSalePayment,
  SalePaymentSchema,
  type SalePayment,
} from "@/data/repositories/salePaymentsRepository";
import type { ProjectSale } from "@/data/repositories/projectSalesRepository";
import { formatPKR } from "@/domain/money";
export function SalePaymentDialog({
  sale,
  received,
  onClose,
  onSaved,
}: {
  sale: ProjectSale;
  received: number;
  onClose: () => void;
  onSaved: (payment: SalePayment) => void;
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
    if (parsed.data.amount > sale.price - received || parsed.data.date < sale.sale_date) {
      setError("Payment must not exceed the balance or predate the sale.");
      return;
    }
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const row = await addSalePayment(sale.project_id, sale.id, parsed.data);
      onSaved(row);
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
          <DialogTitle>Record buyer payment</DialogTitle>
          <p>
            {sale.buyer_name} · {sale.kind} {sale.unit_number}
          </p>
          <p>
            Still to receive: <strong>{formatPKR(sale.price - received)}</strong>
          </p>
        </DialogHeader>
        <div className="project-sale-dialog-body">
          <SalePaymentFields value={draft} onChange={setDraft} disabled={busy} />
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
            {busy ? "Saving…" : "Save payment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
