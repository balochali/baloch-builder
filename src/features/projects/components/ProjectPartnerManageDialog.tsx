import { validateAttachment } from "@/domain/attachments";
import { PartnerPaymentFields } from "@/components/PartnerPaymentFields";
import { AttachmentUpload } from "@/components/AttachmentUpload";
import { PartnerDocuments } from "@/features/projects/components/PartnerDocuments";
import { PaginatedRecords } from "@/components/Pagination";
import {
  PaymentAccountSelect,
  PaymentMethodSelect,
  PaymentModalHeader,
} from "@/components/PaymentChoices";
import { useEffect, useState } from "react";
import { format } from "date-fns";
import { Building2, HandCoins, UserRound, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { SavedImageGallery } from "@/components/attachments/ImageGallery";
import {
  listPartnerPaymentDocuments,
  savePartnerContributionReceipt,
  savePartnerPayoutReceipt,
  type DocumentRecord,
} from "@/data/repositories/documentsRepository";
import {
  listPartnerPayouts,
  addPartnerPayout,
  type PartnerPayout,
} from "@/data/repositories/projectPayoutsRepository";
import {
  emptyPaymentDetails,
  PartnerContributionSchema,
  UpdateProjectPartnerSchema,
  type PartnerContributionInput,
  type ProjectPartnerRow,
  type UpdateProjectPartnerInput,
  type PaymentDetails,
} from "@/data/repositories/projectPartnersRepository";
import { formatPKR } from "@/domain/money";
import { formatDate } from "@/lib/dates";
import "./project-partner-manage-dialog.css";

type Props = {
  projectId: string;
  partner: ProjectPartnerRow;
  contributions: {
    id: string;
    partner_id: string | null;
    amount: number;
    date: string;
    method: string | null;
  }[];
  remainingShareBp: number;
  onClose: () => void;
  onUpdate: (value: UpdateProjectPartnerInput) => Promise<void>;
  onContribution: (value: PartnerContributionInput) => Promise<string>;
};
type Method = PartnerContributionInput["method"];

function wholeRupees(value: string): number | null {
  const cleaned = value.trim().replace(/,/g, "");
  return /^\d+$/.test(cleaned) && Number.isSafeInteger(Number(cleaned)) ? Number(cleaned) : null;
}
function validImages(files: File[]): boolean {
  try {
    files.forEach((file) => validateAttachment(file, true));
    return true;
  } catch {
    return false;
  }
}

export function ProjectPartnerManageDialog({
  projectId,
  partner,
  contributions,
  remainingShareBp,
  onClose,
  onUpdate,
  onContribution,
}: Props) {
  const [step, setStep] = useState(0);
  const [name, setName] = useState(partner.name);
  const [phone, setPhone] = useState(partner.phone ?? "");
  const [phone2, setPhone2] = useState(partner.phone2 ?? "");
  const [address, setAddress] = useState(partner.address ?? "");
  const [notes, setNotes] = useState(partner.notes ?? "");
  const [share, setShare] = useState((partner.share_bp / 100).toString());
  const [agreed, setAgreed] = useState(partner.agreed_contribution?.toString() ?? "");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [account, setAccount] = useState<"" | "personal" | "builder">("");
  const [method, setMethod] = useState<Method>("cash");
  const [reference, setReference] = useState("");
  const [paymentNote, setPaymentNote] = useState("");
  const [details, setDetails] = useState<PaymentDetails>({ ...emptyPaymentDetails });
  const [images, setImages] = useState<File[]>([]);
  const [savedImages, setSavedImages] = useState<DocumentRecord[]>([]);
  const [payouts, setPayouts] = useState<PartnerPayout[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    Promise.all([
      listPartnerPayouts(projectId),
      listPartnerPaymentDocuments(projectId, partner.partner_id),
    ])
      .then(([payoutRows, documentRows]) => {
        if (active) {
          setPayouts(payoutRows);
          setSavedImages(documentRows);
        }
      })
      .catch(() => {
        if (active) setError("Could not load this partner’s payout or receipt history.");
      });
    return () => {
      active = false;
    };
  }, [projectId, partner.partner_id]);

  const partnerContributions = contributions.filter(
    (item) => item.partner_id === partner.partner_id,
  );
  const partnerPayouts = payouts.filter(
    (item) => item.partner_id === partner.partner_id && item.payout_purpose === "profit",
  );
  const profitPaid = partnerPayouts.reduce((sum, item) => sum + item.amount, 0);

  async function saveDetails() {
    setError("");
    setMessage("");
    const percentage = /^\d+(?:\.\d{1,2})?$/.test(share.trim()) ? Number(share) : NaN;
    const parsed = UpdateProjectPartnerSchema.safeParse({
      project_id: projectId,
      partnership_id: partner.partnership_id,
      name,
      phone,
      phone2,
      address,
      notes,
      share_bp: Math.round(percentage * 100),
      agreed_contribution: agreed.trim() ? wholeRupees(agreed) : null,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check partner details");
      return;
    }
    if (parsed.data.share_bp > remainingShareBp) {
      setError(`Only ${(remainingShareBp / 100).toFixed(2)}% is available for this partner.`);
      return;
    }
    setPending(true);
    try {
      await onUpdate(parsed.data);
      setMessage("Partner details saved.");
    } catch (cause) {
      setError(`Could not update partner: ${String(cause)}`);
    } finally {
      setPending(false);
    }
  }

  async function savePayment() {
    setError("");
    setMessage("");
    const paymentAmount = wholeRupees(amount);
    if (!paymentAmount || paymentAmount <= 0) {
      setError("Enter an amount greater than zero in whole rupees.");
      return;
    }
    if (!account) {
      setError("Choose Personal or Builder account for this payment.");
      return;
    }
    if (!validImages(images)) {
      setError("Choose PDF, JPEG, PNG, WebP or GIF files smaller than 10 MB each.");
      return;
    }
    const paymentDetails: PaymentDetails = { ...emptyPaymentDetails, ...details };
    const payment = PartnerContributionSchema.safeParse({
      project_id: projectId,
      partner_id: partner.partner_id,
      account_key: account,
      amount: paymentAmount,
      date,
      method,
      reference,
      description: paymentNote,
      payment_details: paymentDetails,
    });
    if (!payment.success) {
      setError(payment.error.issues[0]?.message ?? "Check payment details");
      return;
    }
    setPending(true);
    try {
      const id =
        step === 1
          ? await onContribution(payment.data)
          : await addPartnerPayout({
              project_id: projectId,
              partner_id: partner.partner_id,
              amount: paymentAmount,
              date,
              purpose: "profit",
              account_key: account,
              method,
              reference,
              notes: paymentNote,
              payment_details: payment.data.payment_details,
            });
      setAmount("");
      setReference("");
      setPaymentNote("");
      setDetails({ ...emptyPaymentDetails });
      const selectedImages = images;
      setImages([]);
      try {
        await Promise.all(
          selectedImages.map((file) =>
            step === 1
              ? savePartnerContributionReceipt(id, file, date, method)
              : savePartnerPayoutReceipt(id, file, date, method),
          ),
        );
        setMessage(
          step === 1 ? "Contribution and receipts saved." : "Profit payout and receipts saved.",
        );
      } catch (cause) {
        setError(`Payment was saved, but a receipt could not be saved: ${String(cause)}`);
      }
      const [payoutRows, documentRows] = await Promise.all([
        listPartnerPayouts(projectId),
        listPartnerPaymentDocuments(projectId, partner.partner_id),
      ]);
      setPayouts(payoutRows);
      setSavedImages(documentRows);
    } catch (cause) {
      setError(`Could not record payment: ${String(cause)}`);
    } finally {
      setPending(false);
    }
  }

  function changeStep(next: number) {
    setStep(next);
    setError("");
    setMessage("");
    setImages([]);
    setAmount("");
    setReference("");
    setDetails({ ...emptyPaymentDetails });
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !pending) onClose();
      }}
    >
      <DialogContent className="partner-manage-dialog payment-modal">
        <PaymentModalHeader
          icon={HandCoins}
          eyebrow="PROJECT PARTNER"
          title={partner.name}
          description="Edit the agreement, record money received, or save profit paid out."
        />
        <nav className="partner-manage-steps" aria-label="Partner actions">
          {[
            { label: "Edit details", icon: UserRound },
            { label: "Record payment", icon: Wallet },
            { label: "Profit given", icon: Building2 },
          ].map(({ label, icon: Icon }, index) => (
            <button
              key={label}
              type="button"
              className={step === index ? "is-active" : ""}
              onClick={() => changeStep(index)}
              disabled={pending}
            >
              <span>{index + 1}</span>
              <Icon size={18} />
              <strong>{label}</strong>
            </button>
          ))}
        </nav>
        {step === 0 ? (
          <div className="partner-manage-body">
            <div className="partner-manage-intro">
              <h3>Edit partner details</h3>
              <p>Update contact information, ownership share, and the promised contribution.</p>
            </div>
            <div className="partner-manage-grid">
              <label className="partner-manage-field">
                Partner name *
                <Input value={name} onChange={(event) => setName(event.target.value)} />
              </label>
              <label className="partner-manage-field">
                Mobile number *
                <Input value={phone} onChange={(event) => setPhone(event.target.value)} />
              </label>
              <label className="partner-manage-field">
                Other phone
                <Input value={phone2} onChange={(event) => setPhone2(event.target.value)} />
              </label>
              <label className="partner-manage-field">
                Address
                <Input value={address} onChange={(event) => setAddress(event.target.value)} />
              </label>
              <label className="partner-manage-field">
                Project share (%) *
                <Input
                  type="number"
                  min="0.01"
                  max={remainingShareBp / 100}
                  step="0.01"
                  value={share}
                  onChange={(event) => setShare(event.target.value)}
                />
              </label>
              <label className="partner-manage-field">
                Promised amount (Rs)
                <Input
                  inputMode="numeric"
                  value={agreed}
                  onChange={(event) => setAgreed(event.target.value)}
                />
              </label>
            </div>
            <label className="partner-manage-field">
              Notes
              <Input value={notes} onChange={(event) => setNotes(event.target.value)} />
            </label>
            <div className="partner-manage-summary">
              <span>
                Already given to project <strong>{formatPKR(partner.contributed)}</strong>
              </span>
              <span>
                Share available for this partner{" "}
                <strong>{(remainingShareBp / 100).toFixed(2)}%</strong>
              </span>
            </div>
          </div>
        ) : (
          <div className="partner-manage-body">
            <div className="partner-manage-intro">
              <h3>
                {step === 1
                  ? "Record a payment from this partner"
                  : "Record profit given to this partner"}
              </h3>
              <p>
                {step === 1
                  ? "This increases the amount the partner has contributed to the project."
                  : "This is money paid out to the partner. It is shown in Bank and stays separate from project costs."}
              </p>
            </div>
            <div className="partner-manage-summary">
              <span>
                {step === 1 ? "Given so far" : "Profit paid so far"}
                <strong>{formatPKR(step === 1 ? partner.contributed : profitPaid)}</strong>
              </span>
              {step === 1 && (
                <span>
                  Still promised
                  <strong>
                    {partner.agreed_contribution === null
                      ? "Not set"
                      : formatPKR(Math.max(0, partner.agreed_contribution - partner.contributed))}
                  </strong>
                </span>
              )}
            </div>
            <div className="partner-manage-grid">
              <label className="partner-manage-field">
                Amount (Rs) *
                <Input
                  inputMode="numeric"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  placeholder="e.g. 50,000"
                />
              </label>
              <label className="partner-manage-field">
                Payment date *
                <Input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
              </label>
            </div>
            <PaymentAccountSelect
              value={account}
              onChange={setAccount}
              direction={step === 1 ? "in" : "out"}
              disabled={pending}
            />
            <PaymentMethodSelect
              value={method}
              onChange={(next) => {
                setMethod(next);
                setReference("");
                setDetails({ ...emptyPaymentDetails });
              }}
              disabled={pending}
            >
              <PartnerPaymentFields
                method={method}
                value={details}
                onChange={setDetails}
                reference={reference}
                onReferenceChange={setReference}
                disabled={pending}
              />
            </PaymentMethodSelect>
            <label className="partner-manage-field">
              Notes (optional)
              <Input value={paymentNote} onChange={(event) => setPaymentNote(event.target.value)} />
            </label>
            <AttachmentUpload
              files={images}
              onChange={setImages}
              allowPdf
              disabled={pending}
              onError={setError}
            />
            <details className="partner-manage-history">
              <summary>
                {step === 1
                  ? `Contribution history (${partnerContributions.length})`
                  : `Profit payout history (${partnerPayouts.length})`}
              </summary>
              {(step === 1 ? partnerContributions : partnerPayouts).length ? (
                <PaginatedRecords
                  label="partner payments"
                  items={step === 1 ? partnerContributions : partnerPayouts}
                >
                  {(item) => (
                    <div className="partner-manage-history-row" key={item.id}>
                      <span>
                        <strong>{formatDate(item.date)}</strong>
                        <small>{item.method || "Method not recorded"}</small>
                        <SavedImageGallery
                          documents={savedImages.filter(
                            (document) => document.owner_id === item.id,
                          )}
                        />
                      </span>
                      <b>{formatPKR(item.amount)}</b>
                    </div>
                  )}
                </PaginatedRecords>
              ) : (
                <p>No payments recorded yet.</p>
              )}
            </details>
          </div>
        )}
        {error && (
          <p role="alert" className="partner-manage-error">
            {error}
          </p>
        )}
        {message && (
          <p role="status" className="partner-manage-success">
            {message}
          </p>
        )}
        <PartnerDocuments projectId={projectId} partner={partner} />
        <DialogFooter className="partner-manage-footer">
          <Button type="button" variant="outline" disabled={pending} onClick={onClose}>
            Close
          </Button>
          {step > 0 && (
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => changeStep(step - 1)}
            >
              Back
            </Button>
          )}
          {step === 0 ? (
            <Button type="button" disabled={pending} onClick={() => void saveDetails()}>
              {pending ? "Saving…" : "Save details"}
            </Button>
          ) : (
            <Button type="button" disabled={pending} onClick={() => void savePayment()}>
              {pending ? "Saving…" : step === 1 ? "Save payment" : "Save profit payout"}
            </Button>
          )}
          {step < 2 && (
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => changeStep(step + 1)}
            >
              Next
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
