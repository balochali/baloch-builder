import { useState, type FormEvent } from "react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AddProjectPartnerSchema, PartnerContributionSchema,
  type AddProjectPartnerInput, type PartnerContributionInput,
  type ProjectPartnerRow, type PaymentDetails, emptyPaymentDetails } from "@/data/repositories/projectPartnersRepository";

type Props = {
  projectId: string;
  partner?: ProjectPartnerRow;
  remainingShareBp?: number;
  onOpenChange: (open: boolean) => void;
  onAddPartner?: (value: AddProjectPartnerInput) => Promise<void>;
  onContribution?: (value: PartnerContributionInput) => Promise<void>;
};

function wholeRupees(raw: string): number | null {
  const cleaned = raw.trim().replace(/,/g, "");
  if (!/^\d+$/.test(cleaned)) return null;
  const number = Number(cleaned);
  return Number.isSafeInteger(number) ? number : null;
}

export function ProjectPartnerDialog({ projectId, partner, remainingShareBp = 10_000,
  onOpenChange, onAddPartner, onContribution }: Props) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [phone2, setPhone2] = useState("");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [share, setShare] = useState("");
  const [agreed, setAgreed] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [method, setMethod] = useState<"cash" | "bank" | "cheque" | "other">("cash");
  const [reference, setReference] = useState("");
  const [paymentDetails, setPaymentDetails] = useState<PaymentDetails>({ ...emptyPaymentDetails });
  const [description, setDescription] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  function updatePaymentDetail(key: keyof PaymentDetails, value: string) {
    setPaymentDetails((current) => ({ ...current, [key]: value }));
  }

  function relevantDetails(): PaymentDetails {
    const details = { ...emptyPaymentDetails, receipt_no: paymentDetails.receipt_no };
    if (method === "bank") return { ...details, from_bank: paymentDetails.from_bank,
      from_account_name: paymentDetails.from_account_name, from_account_no: paymentDetails.from_account_no,
      to_bank: paymentDetails.to_bank, to_account_name: paymentDetails.to_account_name,
      to_account_no: paymentDetails.to_account_no };
    if (method === "cheque") return { ...details, from_bank: paymentDetails.from_bank,
      from_account_name: paymentDetails.from_account_name, from_account_no: paymentDetails.from_account_no,
      cheque_no: paymentDetails.cheque_no, cheque_date: paymentDetails.cheque_date,
      cheque_payee: paymentDetails.cheque_payee, to_bank: paymentDetails.to_bank };
    if (method === "cash") return { ...details, received_by: paymentDetails.received_by };
    return details;
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (partner) {
      const parsed = PartnerContributionSchema.safeParse({ project_id: projectId,
        partner_id: partner.partner_id, amount: wholeRupees(amount), date, method, reference,
        description, payment_details: relevantDetails() });
      if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? "Check payment details"); return; }
      setPending(true);
      try { await onContribution?.(parsed.data); onOpenChange(false); }
      catch (cause) { setError(`Could not record contribution: ${String(cause)}`); }
      finally { setPending(false); }
      return;
    }
    const percentage = /^\d+(?:\.\d{1,2})?$/.test(share.trim()) ? Number(share) : NaN;
    const shareBp = Number.isFinite(percentage) ? Math.round(percentage * 100) : NaN;
    if (shareBp > remainingShareBp) { setError(`Only ${(remainingShareBp / 100).toFixed(2)}% share remains.`); return; }
    if ((agreed.trim() && wholeRupees(agreed) === null) || (amount.trim() && wholeRupees(amount) === null)) {
      setError("Enter whole rupee amounts using digits and optional commas."); return;
    }
    const parsed = AddProjectPartnerSchema.safeParse({ project_id: projectId, name, phone, phone2,
      address, notes, share_bp: shareBp, agreed_contribution: agreed.trim() ? wholeRupees(agreed) : null,
      initial_amount: amount.trim() ? wholeRupees(amount) : null,
      initial_date: amount.trim() ? date : null, initial_method: method, initial_reference: reference,
      initial_payment_details: relevantDetails() });
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? "Check partner details"); return; }
    setPending(true);
    try { await onAddPartner?.(parsed.data); onOpenChange(false); }
    catch (cause) { setError(`Could not add partner: ${String(cause)}`); }
    finally { setPending(false); }
  }

  return <Dialog open onOpenChange={onOpenChange}>
    <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
      <DialogHeader><DialogTitle>{partner ? `Record contribution · ${partner.name}` : "Add Project Partner"}</DialogTitle></DialogHeader>
      <form id="partner-form" onSubmit={save} className="space-y-4">
        {!partner && <>
          <Field id="partner-name" label="Partner name *" value={name} onChange={setName} required />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="partner-phone" label="Mobile number *" type="tel" value={phone} onChange={setPhone} required />
            <Field id="partner-phone2" label="Other phone" type="tel" value={phone2} onChange={setPhone2} />
          </div>
          <Field id="partner-address" label="Address" value={address} onChange={setAddress} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="partner-share" label="Project share (%) *" type="number" min="0.01" max={remainingShareBp / 100}
              step="0.01" value={share} onChange={setShare} required />
            <Field id="partner-agreed" label="Agreed contribution (Rs)" inputMode="numeric"
              value={agreed} onChange={setAgreed} />
          </div>
          <p className="text-xs text-muted-foreground">Available share: {(remainingShareBp / 100).toFixed(2)}%. Agreed contribution is a commitment, not money received.</p>
          <Field id="partner-notes" label="Notes" value={notes} onChange={setNotes} />
          <p className="border-t pt-4 text-sm font-semibold">First payment (optional)</p>
        </>}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="partner-amount" label={partner ? "Amount received (Rs) *" : "Amount received (Rs)"}
            inputMode="numeric" value={amount} onChange={setAmount} required={!!partner} />
          <Field id="partner-date" label="Date received" type="date" value={date} onChange={setDate} required={!!partner} />
        </div>
        {(partner || amount.trim()) && <>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5"><Label htmlFor="partner-method">Payment method</Label>
              <select id="partner-method" value={method} onChange={(event) => setMethod(event.target.value as typeof method)}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
                <option value="cash">Cash</option><option value="bank">Bank</option>
                <option value="cheque">Cheque</option><option value="other">Other</option>
              </select></div>
            <Field id="partner-reference" label={method === "bank" ? "Transfer reference / transaction ID *" : "Reference"}
              value={reference} onChange={setReference} required={method === "bank"} />
          </div>
          {method === "bank" && <div className="space-y-3 rounded-lg border p-3">
            <p className="text-sm font-semibold">Bank transfer details</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field id="payment-from-bank" label="Sender bank *" value={paymentDetails.from_bank}
                onChange={(value) => updatePaymentDetail("from_bank", value)} required />
              <Field id="payment-from-name" label="Sender account name *" value={paymentDetails.from_account_name}
                onChange={(value) => updatePaymentDetail("from_account_name", value)} required />
              <Field id="payment-from-number" label="Sender account / IBAN" value={paymentDetails.from_account_no}
                onChange={(value) => updatePaymentDetail("from_account_no", value)} />
              <Field id="payment-to-bank" label="Receiving bank *" value={paymentDetails.to_bank}
                onChange={(value) => updatePaymentDetail("to_bank", value)} required />
              <Field id="payment-to-name" label="Receiving account name *" value={paymentDetails.to_account_name}
                onChange={(value) => updatePaymentDetail("to_account_name", value)} required />
              <Field id="payment-to-number" label="Receiving account / IBAN" value={paymentDetails.to_account_no}
                onChange={(value) => updatePaymentDetail("to_account_no", value)} />
            </div>
          </div>}
          {method === "cheque" && <div className="space-y-3 rounded-lg border p-3">
            <p className="text-sm font-semibold">Cheque details</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field id="payment-cheque-no" label="Cheque number *" value={paymentDetails.cheque_no}
                onChange={(value) => updatePaymentDetail("cheque_no", value)} required />
              <Field id="payment-cheque-date" label="Cheque date *" type="date" value={paymentDetails.cheque_date}
                onChange={(value) => updatePaymentDetail("cheque_date", value)} required />
              <Field id="payment-issuing-bank" label="Issuing bank *" value={paymentDetails.from_bank}
                onChange={(value) => updatePaymentDetail("from_bank", value)} required />
              <Field id="payment-account-name" label="Account holder *" value={paymentDetails.from_account_name}
                onChange={(value) => updatePaymentDetail("from_account_name", value)} required />
              <Field id="payment-account-no" label="Account number" value={paymentDetails.from_account_no}
                onChange={(value) => updatePaymentDetail("from_account_no", value)} />
              <Field id="payment-payee" label="Payable to *" value={paymentDetails.cheque_payee}
                onChange={(value) => updatePaymentDetail("cheque_payee", value)} required />
              <Field id="payment-deposit-bank" label="Deposited to bank" value={paymentDetails.to_bank}
                onChange={(value) => updatePaymentDetail("to_bank", value)} />
            </div>
          </div>}
          {method === "cash" && <Field id="payment-received-by" label="Received by" value={paymentDetails.received_by}
            onChange={(value) => updatePaymentDetail("received_by", value)} />}
          <Field id="payment-receipt" label="Receipt number" value={paymentDetails.receipt_no}
            onChange={(value) => updatePaymentDetail("receipt_no", value)} />
          {partner && <Field id="partner-description" label="Notes about payment" value={description} onChange={setDescription} />}
        </>}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      </form>
      <DialogFooter>
        <Button type="button" variant="outline" disabled={pending} onClick={() => onOpenChange(false)}>Cancel</Button>
        <Button type="submit" form="partner-form" disabled={pending}>{pending ? "Saving…" : partner ? "Record Payment" : "Add Partner"}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}

function Field({ id, label, value, onChange, ...props }: {
  id: string; label: string; value: string; onChange: (value: string) => void;
} & Omit<React.ComponentProps<typeof Input>, "id" | "value" | "onChange">) {
  return <div className="space-y-1.5"><Label htmlFor={id}>{label}</Label>
    <Input id={id} value={value} onChange={(event) => onChange(event.target.value)} {...props} /></div>;
}
