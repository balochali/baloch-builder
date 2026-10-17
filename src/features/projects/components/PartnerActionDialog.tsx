import {
  listFundingRounds,
  type FundingRound,
  type FundingAllocation,
} from "@/data/repositories/partnerFundingRepository";
import { validateAttachment } from "@/domain/attachments";
import { PartnerPaymentFields } from "@/components/PartnerPaymentFields";
import { AttachmentUpload } from "@/components/AttachmentUpload";
import { PartnerDocuments } from "@/features/projects/components/PartnerDocuments";
import {
  PaymentAccountSelect,
  PaymentMethodSelect,
  PaymentModalHeader,
} from "@/components/PaymentChoices";
import { useEffect, useState } from "react";
import { format } from "date-fns";
import { HandCoins } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  savePartnerContributionReceipt,
  savePartnerPayoutReceipt,
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
import "./project-partner-manage-dialog.css";

export type PartnerAccountAction = "edit" | "land" | "construction" | "capital" | "profit";

type Props = {
  initialAction?: PartnerAccountAction;
  projectId: string;
  partner: ProjectPartnerRow;
  contributions: {
    id: string;
    partner_id: string | null;
    amount: number;
    date: string;
    method: string | null;
    custom?: string;
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

export function PartnerActionDialog({
  initialAction = "edit",
  projectId,
  partner,
  contributions,
  remainingShareBp,
  onClose,
  onUpdate,
  onContribution,
}: Props) {
  const step =
    initialAction === "edit"
      ? 0
      : initialAction === "land" || initialAction === "construction"
        ? 1
        : 2;
  const payoutPurpose = initialAction === "capital" ? "capital_return" : "profit";
  const [name, setName] = useState(partner.name);
  const [phone, setPhone] = useState(partner.phone ?? "");
  const [phone2, setPhone2] = useState(partner.phone2 ?? "");
  const [address, setAddress] = useState(partner.address ?? "");
  const [notes, setNotes] = useState(partner.notes ?? "");
  const [share, setShare] = useState((partner.share_bp / 100).toString());
  const [agreed, setAgreed] = useState(partner.agreed_contribution?.toString() ?? "");
  const [fundingRoundId, setFundingRoundId] = useState(
    initialAction === "construction" ? "choose-construction" : "",
  );
  const [fundingRounds, setFundingRounds] = useState<FundingRound[]>([]);
  const selectedAllocation = fundingRounds.find((r) => r.id === fundingRoundId);
  const roundRequired = selectedAllocation
    ? ((JSON.parse(selectedAllocation.allocations) as FundingAllocation[]).find(
        (p) => p.partner_id === partner.partner_id,
      )?.amount ?? 0)
    : 0;
  const roundPaid = contributions
    .filter((p) => p.partner_id === partner.partner_id)
    .reduce((total, p) => {
      try {
        const custom = JSON.parse(p.custom ?? "{}");
        return (
          total +
          (custom.contribution_purpose === "construction" &&
          custom.funding_round_id === fundingRoundId
            ? p.amount
            : 0)
        );
      } catch {
        return total;
      }
    }, 0);
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [account, setAccount] = useState<"" | "personal" | "builder">("");
  const [method, setMethod] = useState<Method>("cash");
  const [reference, setReference] = useState("");
  const [paymentNote, setPaymentNote] = useState("");
  const [details, setDetails] = useState<PaymentDetails>({ ...emptyPaymentDetails });
  const [images, setImages] = useState<File[]>([]);
  const [payouts, setPayouts] = useState<PartnerPayout[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  useEffect(() => {
    if (initialAction !== "construction") return;
    let active = true;
    listFundingRounds(projectId)
      .then((rows) => {
        if (active) setFundingRounds(rows);
      })
      .catch(() => {
        if (active) setError("Could not load construction requests. Reopen this profile to retry.");
      });
    return () => {
      active = false;
    };
  }, [projectId, initialAction]);

  useEffect(() => {
    let active = true;
    Promise.all([listPartnerPayouts(projectId)])
      .then(([payoutRows]) => {
        if (active) {
          setPayouts(payoutRows);
        }
      })
      .catch(() => {
        if (active) setError("Could not load this partner’s payout or receipt history.");
      });
    return () => {
      active = false;
    };
  }, [projectId, partner.partner_id]);

  const partnerPayouts = payouts.filter((item) => item.partner_id === partner.partner_id);
  const selectedPayoutTotal = partnerPayouts
    .filter((item) => item.payout_purpose === payoutPurpose)
    .reduce((sum, item) => sum + item.amount, 0);

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
    if (step === 1 && fundingRoundId === "choose-construction") {
      setError(
        "Choose a construction request. If none exist, create one in the project’s Partners tab first.",
      );
      return;
    }
    const paymentDetails: PaymentDetails = { ...emptyPaymentDetails, ...details };
    const payment = PartnerContributionSchema.safeParse({
      contribution_purpose: fundingRoundId ? "construction" : "land",
      funding_round_id: fundingRoundId || undefined,
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
              purpose: payoutPurpose,
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
          step === 1
            ? "Contribution and receipts saved."
            : "Payment to partner and receipts saved.",
        );
      } catch (cause) {
        setError(`Payment was saved, but a receipt could not be saved: ${String(cause)}`);
      }
      const [payoutRows] = await Promise.all([listPartnerPayouts(projectId)]);
      setPayouts(payoutRows);
    } catch (cause) {
      setError(`Could not record payment: ${String(cause)}`);
    } finally {
      setPending(false);
    }
  }

  const actionTitle = {
    edit: "Edit partner details",
    land: "Receive land payment",
    construction: "Receive construction payment",
    capital: "Return capital",
    profit: "Pay profit",
  }[initialAction];
  const actionDescription = {
    edit: "Contact details, ownership and agreed land investment.",
    land: "Record land investment received from this partner.",
    construction: "Record this partner’s payment against a construction request.",
    capital: "Pay back the partner’s investment. This reduces capital held.",
    profit: "Record profit paid to this partner. Their investment stays unchanged.",
  }[initialAction];

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
          title={actionTitle}
          description={`${partner.name} · ${actionDescription}`}
        />
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
                Agreed land amount (Rs)
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
                  : "Record money paid to this partner"}
              </h3>
              <p>
                {step === 1
                  ? "Credit: money received from this partner as investment."
                  : "Debit: money paid back to this partner."}
              </p>
            </div>
            <div className="partner-manage-summary">
              <span>
                {step === 1
                  ? "Investment received · Credit"
                  : payoutPurpose === "profit"
                    ? "Profit paid · Debit"
                    : "Capital returned · Debit"}
                <strong>{formatPKR(step === 1 ? partner.contributed : selectedPayoutTotal)}</strong>
              </span>
              {initialAction === "land" && (
                <span>
                  Land still to receive
                  <strong>
                    {partner.agreed_contribution === null
                      ? "Not set"
                      : formatPKR(
                          Math.max(
                            0,
                            partner.agreed_contribution -
                              (partner.land_contributed ?? partner.contributed),
                          ),
                        )}
                  </strong>
                </span>
              )}
            </div>
            {initialAction === "construction" && (
              <label className="partner-manage-field">
                Construction request
                <select
                  value={fundingRoundId}
                  onChange={(event) => setFundingRoundId(event.target.value)}
                  disabled={pending}
                  className="rounded-md border bg-background p-3"
                >
                  <option value="choose-construction" disabled>
                    Choose a construction request
                  </option>
                  {fundingRounds
                    .filter((r) =>
                      (JSON.parse(r.allocations) as FundingAllocation[]).some(
                        (p) => p.partner_id === partner.partner_id && p.amount > 0,
                      ),
                    )
                    .map((r) => (
                      <option key={r.id} value={r.id}>
                        Construction: {r.title}
                      </option>
                    ))}
                </select>
                <small>
                  {fundingRoundId === "choose-construction"
                    ? "Select a request above. If none are listed, create one using Request construction money in the Partners tab."
                    : fundingRoundId
                      ? `Your share for this request: ${formatPKR(roundRequired)}. Still to pay: ${formatPKR(Math.max(0, roundRequired - roundPaid))}.`
                      : "The agreed amount covers land purchase only."}
                </small>
              </label>
            )}
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
        {initialAction === "edit" && <PartnerDocuments projectId={projectId} partner={partner} />}
        <DialogFooter className="partner-manage-footer">
          <Button type="button" variant="outline" disabled={pending} onClick={onClose}>
            Close
          </Button>
          {step === 0 ? (
            <Button type="button" disabled={pending} onClick={() => void saveDetails()}>
              {pending ? "Saving…" : "Save details"}
            </Button>
          ) : (
            <Button type="button" disabled={pending} onClick={() => void savePayment()}>
              {pending
                ? "Saving…"
                : step === 1
                  ? "Save payment"
                  : initialAction === "capital"
                    ? "Save capital return"
                    : "Save profit payment"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
