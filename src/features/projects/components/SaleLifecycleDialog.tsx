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
import { percentageAmount, recordSaleEvent } from "@/data/repositories/saleEventsRepository";
import type { ProjectSale } from "@/data/repositories/projectSalesRepository";
import { formatPKR } from "@/domain/money";
export function SaleLifecycleDialog({
  sale,
  received,
  kind,
  onClose,
  onSaved,
}: {
  sale: ProjectSale;
  received: number;
  kind: "cancel" | "resell";
  onClose: () => void;
  onSaved: () => void;
}) {
  const [rate, setRate] = useState("");
  const [resalePrice, setResalePrice] = useState("");
  const [buyer, setBuyer] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [draft, setDraft] = useState(() => newSalePayment(format(new Date(), "yyyy-MM-dd")));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [payLater, setPayLater] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const lock = useRef(false);
  const price = Number(resalePrice.replace(/,/g, ""));
  let fee = 0;
  let valid = true;
  try {
    fee = percentageAmount(kind === "cancel" ? received : price, Number(rate));
  } catch {
    valid = false;
  }
  const refund = received - fee;
  const movement =
    kind === "cancel" ? (payLater ? 0 : Number(draft.amount.replace(/,/g, ""))) : fee;
  async function save() {
    if (lock.current) return;
    if (!valid || !rate.trim() || !confirmed) {
      setError("Enter the percentage and confirm the settlement below.");
      return;
    }
    if (kind === "resell" && (!buyer.trim() || price <= 0 || received !== sale.price)) {
      setError("Enter the new buyer and resale price. The original sale must be fully paid.");
      return;
    }
    if (
      kind === "cancel" &&
      !payLater &&
      refund > 0 &&
      (!Number.isSafeInteger(movement) || movement <= 0 || movement > refund)
    ) {
      setError("Enter the first refund amount up to the total refund, or choose to refund later.");
      return;
    }
    const parsed =
      movement > 0
        ? SalePaymentSchema.safeParse(paymentInput({ ...draft, amount: String(movement) }))
        : null;
    if (parsed && !parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check payment details");
      return;
    }
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await recordSaleEvent(sale, {
        kind,
        date: draft.date,
        received,
        rate: Number(rate),
        resale_price: kind === "resell" ? price : 0,
        new_buyer_name: buyer,
        new_buyer_phone: phone,
        new_buyer_address: address,
        payment: parsed?.success ? parsed.data : null,
      });
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
          <DialogTitle>
            {kind === "cancel" ? "Cancel sale & refund buyer" : "Resell through builder"}
          </DialogTitle>
          <p>
            {sale.kind} {sale.unit_number} · {sale.buyer_name}
          </p>
        </DialogHeader>
        <div className="project-sale-dialog-body">
          {kind === "resell" && (
            <>
              <p>
                The original buyer must be fully paid. The resale price is settled privately between
                buyers; only the builder’s commission is recorded as new project income.
              </p>
              <div className="project-sale-fields">
                <label>
                  New buyer name *
                  <input value={buyer} onChange={(e) => setBuyer(e.target.value)} disabled={busy} />
                </label>
                <label>
                  New buyer phone
                  <input value={phone} onChange={(e) => setPhone(e.target.value)} disabled={busy} />
                </label>
                <label>
                  New buyer address
                  <input
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    disabled={busy}
                  />
                </label>
                <label>
                  Resale price (Rs) *
                  <input
                    inputMode="numeric"
                    value={resalePrice}
                    onChange={(e) => setResalePrice(e.target.value)}
                    disabled={busy}
                  />
                </label>
              </div>
            </>
          )}
          <div className="project-sale-fields">
            <label>
              {kind === "cancel" ? "Deduction percentage (%) *" : "Builder commission (%) *"}
              <input
                type="number"
                min="0"
                max="100"
                step="0.01"
                value={rate}
                onChange={(e) => setRate(e.target.value)}
                disabled={busy}
              />
            </label>
          </div>
          <div className="sale-settlement-preview">
            {kind === "cancel" ? (
              <>
                <span>
                  Money received<strong>{formatPKR(received)}</strong>
                </span>
                <span>
                  Deduction retained<strong>{formatPKR(fee)}</strong>
                </span>
                <span>
                  Refund to buyer<strong>{formatPKR(Math.max(0, refund))}</strong>
                </span>
              </>
            ) : (
              <span>
                Builder commission to receive<strong>{formatPKR(fee)}</strong>
              </span>
            )}
          </div>
          {kind === "cancel" && (
            <p>
              The percentage applies only to money received. You can refund in instalments.
              Cancelling makes this unit available for a new sale; any unpaid refund stays visible.
            </p>
          )}
          {kind === "cancel" && refund > 0 && (
            <>
              <label className="sale-pay-later">
                <input
                  type="checkbox"
                  checked={payLater}
                  onChange={(e) => setPayLater(e.target.checked)}
                  disabled={busy}
                />
                No refund paid yet — pay later
              </label>
              <p>
                Remaining after this payment:{" "}
                <strong>
                  {formatPKR(Math.max(0, refund - (Number.isFinite(movement) ? movement : 0)))}
                </strong>
              </p>
            </>
          )}
          {(kind === "cancel" ? refund > 0 && !payLater : movement > 0) ? (
            <>
              <h3>{kind === "cancel" ? "First refund payment" : "Commission receipt details"}</h3>
              <SalePaymentFields
                value={kind === "cancel" ? draft : { ...draft, amount: String(movement) }}
                onChange={setDraft}
                disabled={busy}
                fixedAmount={kind === "resell"}
                direction={kind === "cancel" ? "out" : "in"}
              />
            </>
          ) : (
            <label>
              Settlement date
              <input
                type="date"
                value={draft.date}
                onChange={(e) => setDraft({ ...draft, date: e.target.value })}
                disabled={busy}
              />
            </label>
          )}
          <label className="sale-pay-later">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
              disabled={busy}
            />
            {kind === "cancel"
              ? "I confirm the cancellation, deduction and any first refund entered."
              : "I confirm the ownership transfer and that the commission shown has been received."}
          </label>
          {error && (
            <p role="alert" className="project-sale-error">
              {error}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Back
          </Button>
          <Button
            onClick={() => void save()}
            disabled={busy || !confirmed || !valid || !rate.trim()}
          >
            {busy ? "Saving…" : kind === "cancel" ? "Confirm cancellation" : "Confirm resale"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
