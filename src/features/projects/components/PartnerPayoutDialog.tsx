import { useState } from "react";
import { format } from "date-fns";
import { ClipboardList, HandCoins, ImagePlus, Wallet } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PaymentAccountSelect, PaymentMethodSelect, PaymentModalHeader, type PaymentMethod } from "@/components/PaymentChoices";
import { addPartnerPayout, PartnerPayoutSchema } from "@/data/repositories/projectPayoutsRepository";
import { emptyPaymentDetails, PartnerContributionSchema, type PaymentDetails, type ProjectPartnerRow } from "@/data/repositories/projectPartnersRepository";
import { savePartnerPayoutReceipt } from "@/data/repositories/documentsRepository";
import { SelectedImagePreviews } from "@/features/documents/components/ImageGallery";
import "./project-entry-dialog.css";
import "./project-partner-manage-dialog.css";

export function PartnerPayoutDialog({ projectId, partner, onClose, onSaved }: { projectId: string; partner: ProjectPartnerRow; onClose: () => void; onSaved: () => Promise<void> }) {
  const [step, setStep] = useState(0);
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [purpose, setPurpose] = useState<"profit" | "capital_return">("profit");
  const [account, setAccount] = useState<"" | "personal" | "builder">("");
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [details, setDetails] = useState<PaymentDetails>({ ...emptyPaymentDetails });
  const [files, setFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function validate(current: number) {
    const parsed = current === 0
      ? PartnerPayoutSchema.pick({ amount: true, date: true, purpose: true }).safeParse({ amount: Number(amount.replace(/,/g, "")), date, purpose })
      : PartnerContributionSchema.safeParse({ project_id: projectId, partner_id: partner.partner_id, amount: Number(amount.replace(/,/g, "")), date, account_key: account, method, reference, description: notes, payment_details: details });
    if (!parsed.success) { setError(parsed.error.issues[0]?.message || "Check payment details."); return false; }
    setError(""); return true;
  }
  async function save() {
    if (saving || !validate(0) || !validate(1) || !account) return;
    setSaving(true);
    try {
      const id = await addPartnerPayout({ project_id: projectId, partner_id: partner.partner_id, amount: Number(amount.replace(/,/g, "")), date, purpose, account_key: account, method, reference, notes, payment_details: details });
      try { await Promise.all(files.map((file) => savePartnerPayoutReceipt(id, file, date, method))); }
      catch { toast.error("Payout saved, but some receipt images could not be saved."); }
      try { await onSaved(); } catch { toast.error("Payout saved. Reopen Profit & Loss to refresh the totals."); }
      onClose();
    } catch (cause) { setError(`Could not save payout: ${String(cause)}`); }
    finally { setSaving(false); }
  }
  const detail = (key: keyof PaymentDetails, label: string, required = false) => <label className="partner-manage-field" key={key}>{label}{required ? " *" : ""}<Input type={key === "cheque_date" ? "date" : "text"} value={details[key]} onChange={(event) => setDetails((current) => ({ ...current, [key]: event.target.value }))} /></label>;

  return <Dialog open onOpenChange={(open) => { if (!open && !saving) onClose(); }}><DialogContent className="payment-modal">
    <PaymentModalHeader icon={HandCoins} eyebrow="PARTNER PAYOUT" title={`Record payout to ${partner.name}`} description="Record money returned to this partner and keep its payment proof." />
    <div className="payment-modal-scroll">
      <div className="construction-stepper" aria-label="Payout steps">{[{ label: "Details", icon: ClipboardList }, { label: "Payment", icon: Wallet }, { label: "Documents", icon: ImagePlus }].map(({ label, icon: Icon }, index) => <button type="button" key={label} disabled={saving || index > step} className={index === step ? "is-current" : index < step ? "is-complete" : ""} aria-current={index === step ? "step" : undefined} onClick={() => { setStep(index); setError(""); }}><Icon size={18} /><strong>{label}</strong></button>)}</div>
      <div className="construction-step-intro"><strong>{step === 0 ? "What are you paying back?" : step === 1 ? "How did you pay?" : "Add payment proof"}</strong><span>{step === 0 ? "Choose profit or returned capital, then enter the amount and date." : step === 1 ? "Choose the paying account and payment method." : "Receipt images are optional and will appear in Bank and Documents."}</span></div>
      {step === 0 && <><fieldset className="partner-manage-choice"><legend>Payment purpose</legend><label><input type="radio" name="payout-purpose" checked={purpose === "profit"} onChange={() => setPurpose("profit")} />Profit payout</label><label><input type="radio" name="payout-purpose" checked={purpose === "capital_return"} onChange={() => setPurpose("capital_return")} />Return of invested capital</label></fieldset><div className="partner-manage-grid"><label className="partner-manage-field">Amount (Rs) *<Input inputMode="numeric" value={amount} onChange={(event) => setAmount(event.target.value)} /></label><label className="partner-manage-field">Payment date *<Input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label></div><label className="partner-manage-field">Notes (optional)<Input value={notes} onChange={(event) => setNotes(event.target.value)} /></label></>}
      {step === 1 && <><PaymentAccountSelect value={account} onChange={setAccount} /><PaymentMethodSelect value={method} onChange={(next) => { setMethod(next); setReference(""); setDetails({ ...emptyPaymentDetails }); }} /><div className="partner-manage-grid">
        {method === "bank" && <>{detail("from_bank", "Sender bank", true)}{detail("from_account_name", "Sender account name", true)}{detail("to_bank", "Receiving bank", true)}{detail("to_account_name", "Receiving account name", true)}{detail("from_account_no", "Sender account / IBAN")}{detail("to_account_no", "Recipient account / IBAN")}</>}
        {method === "cheque" && <>{detail("cheque_no", "Cheque number", true)}{detail("from_bank", "Issuing bank", true)}{detail("from_account_name", "Account holder", true)}{detail("cheque_date", "Cheque date", true)}{detail("cheque_payee", "Payee", true)}</>}
        {method === "digital" && <>{detail("from_bank", "Wallet / service")}{detail("to_account_no", "Recipient wallet / number")}</>}
        <label className="partner-manage-field">{method === "bank" || method === "digital" ? "Transaction reference *" : "Receipt / reference (optional)"}<Input value={reference} onChange={(event) => setReference(event.target.value)} /></label>
      </div></>}
      {step === 2 && <><label className="partner-manage-upload"><input type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple onChange={(event) => { const selected = Array.from(event.target.files || []); if (selected.some((file) => !["image/jpeg", "image/png", "image/webp", "image/gif"].includes(file.type) || !file.size || file.size > 10 * 1024 * 1024)) { setError("Choose image files up to 10 MB each."); event.target.value = ""; return; } setFiles(selected); setError(""); }} /><span><ImagePlus size={23} /></span><strong>Upload payment images (optional)</strong><small>{files.length ? `${files.length} selected` : "Cash receipt, transfer screenshot or cheque image"}</small></label><SelectedImagePreviews files={files} /><p className="project-profit-note">This payout appears in Bank as money out. Profit payouts and returned capital are tracked separately from project costs.</p></>}
      {error && <p role="alert" className="partner-manage-error">{error}</p>}
    </div>
    <DialogFooter>{step > 0 && <Button type="button" variant="outline" disabled={saving} onClick={() => { setStep(step - 1); setError(""); }}>Back</Button>}<Button type="button" variant="outline" disabled={saving} onClick={onClose}>Cancel</Button>{step < 2 ? <Button key="next" type="button" onClick={() => { if (validate(step)) setStep(step + 1); }}>Next</Button> : <Button key="save" type="button" disabled={saving} onClick={() => void save()}>{saving ? "Saving…" : "Save payout"}</Button>}</DialogFooter>
  </DialogContent></Dialog>;
}
