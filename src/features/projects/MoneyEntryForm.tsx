import { useState, type FormEvent } from "react";
import {
  moneyIn,
  moneyOut,
  type FeasibilityData,
  type Funding,
  type JournalRow,
  type MasterPartner,
  type MoneyEntry,
  type Payout,
} from "@baloch/shared";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { api } from "@/data/api";
import { parsePKR, formatPKR } from "./feasibilityFormat";
import {
  balance,
  bankLabel,
  isFunding,
  isPayout,
  loanOutstanding,
  partnerTotals,
  payoutLabels,
} from "./fundingView";
import { encodeAttachments } from "./projectSite";

export type FundingData = {
  lines: JournalRow[];
  entries: MoneyEntry[];
  links: string[];
  lenders: { id: string; name: string }[];
  partners: Pick<MasterPartner, "id" | "name" | "role" | "status">[];
  plan: FeasibilityData | null;
};
type Payload = {
  direction: "in" | "out";
  data: Funding | Payout;
  replaceId?: string;
  attachment?: { name: string; content: string };
};
const sourceLabels = {
  partner: "A partner",
  owner: "Owner's own money (from home)",
  loan: "A loan",
};
const dateToday = () => new Date().toLocaleDateString("en-CA");
export function LenderEditor({
  endpoint,
  close,
  onAdded,
}: {
  endpoint: string;
  close: () => void;
  onAdded: (lender: { id: string; name: string }) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const data = Object.fromEntries(new FormData(event.currentTarget));
    setBusy(true);
    setError("");
    try {
      const lender = await api<{ id: string; name: string }>(endpoint + "/lenders", "POST", data);
      onAdded(lender);
      close();
    } catch (cause) {
      setError(String(cause));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) close();
      }}
    >
      <DialogContent className="project-detail-dialog">
        <DialogTitle>Add lender</DialogTitle>
        <DialogDescription>Save contact information for the loan.</DialogDescription>
        <form onSubmit={submit}>
          <fieldset className="project-form-grid" disabled={busy}>
            <label>
              Name
              <Input name="name" autoFocus required maxLength={120} />
            </label>
            <label>
              Phone
              <Input name="phone" type="tel" maxLength={120} />
            </label>
            <label>
              Address
              <Input name="address" maxLength={500} />
            </label>
            <label>
              Notes
              <Input name="notes" maxLength={500} />
            </label>
          </fieldset>
          {error && <p role="alert">{error}</p>}
          <div className="project-modal-actions">
            <button type="button" className="projects-secondary" disabled={busy} onClick={close}>
              Cancel
            </button>
            <button className="projects-primary" disabled={busy}>
              Save lender
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
export function MoneyEntryForm({
  endpoint,
  direction,
  entry,
  sheet,
  close,
  onSaved,
  onLender,
}: {
  endpoint: string;
  direction: "in" | "out";
  entry?: MoneyEntry;
  sheet: FundingData;
  close: () => void;
  onSaved: () => void;
  onLender: (lender: { id: string; name: string }) => void;
}) {
  const priorIn = entry && isFunding(entry) ? entry.data : undefined;
  const priorOut = entry && isPayout(entry) ? entry.data : undefined;
  const [source, setSource] = useState<Funding["sourceType"]>(priorIn?.sourceType ?? "partner");
  const [kind, setKind] = useState<Payout["kind"]>(priorOut?.kind ?? "capital_return");
  const [lenderId, setLenderId] = useState(priorIn?.lenderPartyId ?? "");
  const [addLender, setAddLender] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmation, setConfirmation] = useState<{
    payload: Payload;
    text: string;
    warnings: string[];
  }>();
  const loans = sheet.entries.filter(
    (e) => isFunding(e) && e.data.sourceType === "loan" && e.status === "posted",
  );
  const owner = sheet.partners.find((p) => p.role === "Owner");
  const partnerOptions = sheet.partners.filter(
    (p) => p.status === "Active" || p.id === entry?.data.partnerId || direction === "out",
  );
  function loanLabel(id: string) {
    const loan = loans.find((e) => isFunding(e) && (e.data.loanKey ?? e.id) === id);
    if (!loan || !isFunding(loan)) return "Loan";
    return sheet.lenders.find((l) => l.id === loan.data.lenderPartyId)?.name ?? "Loan";
  }
  async function review(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const fields = new FormData(event.currentTarget);
    const value = (key: string) => String(fields.get(key) ?? "");
    const common = {
      date: value("date"),
      amount: parsePKR(value("amount")),
      account: value("account"),
      refNo: value("refNo"),
      notes: value("notes"),
      partnerId:
        direction === "in" && source === "owner" ? owner?.id : value("partnerId") || undefined,
    };
    const result =
      direction === "in"
        ? moneyIn.safeParse({
            ...common,
            sourceType: source,
            purpose: value("purpose"),
            lenderPartyId: lenderId || undefined,
            loanTerms:
              source === "loan"
                ? {
                    loanType: value("loanType"),
                    markupPercent:
                      value("markupPercent") === "" ? undefined : Number(value("markupPercent")),
                    dueDate: value("dueDate"),
                  }
                : undefined,
          })
        : moneyOut.safeParse({
            ...common,
            kind,
            loanFundingId: value("loanFundingId") || undefined,
          });
    if (!result.success) {
      setError(
        Number.isSafeInteger(common.amount)
          ? "Check the date and required fields."
          : "Enter a positive whole amount in PKR.",
      );
      return;
    }
    const data = result.data;
    const name =
      "sourceType" in data && data.sourceType === "loan"
        ? sheet.lenders.find((l) => l.id === lenderId)?.name
        : "kind" in data && data.kind.startsWith("loan_")
          ? loanLabel(data.loanFundingId ?? "")
          : sheet.partners.find((p) => p.id === data.partnerId)?.name;
    if (!name) {
      setError("Select the source or recipient first.");
      return;
    }
    const lines = sheet.lines.filter((l) => l.voucherId !== entry?.voucherId);
    const warnings: string[] = [];
    if ("kind" in data) {
      if (data.kind === "capital_return") {
        const totals = partnerTotals(lines, data.partnerId);
        if (data.amount > totals.contributed - totals.returned)
          warnings.push("This return is more than the partner's remaining capital.");
      }
      if (
        data.kind === "loan_principal" &&
        data.loanFundingId &&
        data.amount > loanOutstanding(sheet.entries, lines, data.loanFundingId)
      )
        warnings.push("This repayment is more than the outstanding loan principal.");
      if (data.amount > balance(lines, data.account === "company_bank" ? "1010" : "1000"))
        warnings.push("This is more than the project funds available in the chosen account.");
    }
    const amount = "PKR " + formatPKR(data.amount);
    const text =
      "sourceType" in data
        ? data.sourceType === "loan"
          ? `Receive ${amount} from ${name} as a loan into ${bankLabel(data.account).toLowerCase()}.`
          : `Add ${amount} to ${name}'s capital and to ${bankLabel(data.account).toLowerCase()}.`
        : `${payoutLabels[data.kind]}: pay ${amount} to ${name} from ${bankLabel(data.account).toLowerCase()}.`;
    setBusy(true);
    setError("");
    try {
      const selected = fields.get("attachment");
      const [attachment] =
        selected instanceof File && selected.name ? await encodeAttachments([selected]) : [];
      setConfirmation({
        payload: { direction, data, replaceId: entry?.id, attachment },
        text,
        warnings,
      });
    } catch (cause) {
      setError(String(cause));
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    if (!confirmation || busy) return;
    setBusy(true);
    setError("");
    try {
      await api(endpoint, "POST", confirmation.payload);
      onSaved();
      close();
    } catch (cause) {
      setError(String(cause));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Dialog
        open
        onOpenChange={(open) => {
          if (!open && !busy) close();
        }}
      >
        <DialogContent className="project-detail-dialog">
          <DialogTitle>
            {entry ? "Edit" : "Add"} money {direction}
          </DialogTitle>
          <DialogDescription>Review the details before saving this entry.</DialogDescription>
          <form onSubmit={review} hidden={!!confirmation}>
            <fieldset className="project-form-grid" disabled={busy}>
              {direction === "in" ? (
                <>
                  <fieldset className="project-full funding-options">
                    <legend>Where is the money coming from?</legend>
                    {(Object.entries(sourceLabels) as [Funding["sourceType"], string][]).map(
                      ([key, label]) => (
                        <label key={key}>
                          <input
                            type="radio"
                            checked={source === key}
                            onChange={() => setSource(key)}
                          />
                          {label}
                        </label>
                      ),
                    )}
                    <label>
                      <input type="radio" disabled /> Customer booking — Comes with the Flats/Shops
                      sales module
                    </label>
                  </fieldset>
                  {source === "partner" && (
                    <label>
                      Partner
                      <select name="partnerId" defaultValue={priorIn?.partnerId ?? ""} required>
                        <option value="">Select partner</option>
                        {partnerOptions
                          .filter((p) => p.role !== "Owner")
                          .map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                      </select>
                    </label>
                  )}
                  {source === "owner" && (
                    <p className="project-full">Money source: {owner?.name ?? "Owner"}</p>
                  )}
                  {source === "loan" && (
                    <>
                      <div className="site-contact-field">
                        <label>
                          Lender
                          <select
                            value={lenderId}
                            onChange={(event) => setLenderId(event.target.value)}
                            required
                          >
                            <option value="">Select lender</option>
                            {sheet.lenders.map((l) => (
                              <option key={l.id} value={l.id}>
                                {l.name}
                              </option>
                            ))}
                          </select>
                        </label>
                        <button
                          type="button"
                          className="projects-secondary"
                          onClick={() => setAddLender(true)}
                        >
                          Add lender
                        </button>
                      </div>
                      <label>
                        Loan type
                        <select
                          name="loanType"
                          defaultValue={priorIn?.loanTerms?.loanType ?? "Bank loan"}
                        >
                          <option>Bank loan</option>
                          <option>Personal loan</option>
                          <option>Other</option>
                        </select>
                      </label>
                      <label>
                        Markup % per year
                        <Input
                          name="markupPercent"
                          type="number"
                          min={0}
                          max={100}
                          step="0.01"
                          defaultValue={priorIn?.loanTerms?.markupPercent}
                        />
                      </label>
                      <label>
                        Due date
                        <Input
                          name="dueDate"
                          type="date"
                          defaultValue={priorIn?.loanTerms?.dueDate}
                        />
                      </label>
                    </>
                  )}
                  <label>
                    Purpose
                    <select name="purpose" defaultValue={priorIn?.purpose ?? "General"}>
                      <option>Land</option>
                      <option>Construction</option>
                      <option>General</option>
                    </select>
                  </label>
                </>
              ) : (
                <>
                  <label>
                    Payment kind
                    <select
                      value={kind}
                      onChange={(event) => setKind(event.target.value as Payout["kind"])}
                    >
                      {Object.entries(payoutLabels).map(([key, label]) => (
                        <option key={key} value={key}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>
                  {kind.startsWith("loan_") ? (
                    <label>
                      Loan
                      <select
                        name="loanFundingId"
                        defaultValue={priorOut?.loanFundingId ?? ""}
                        required
                      >
                        <option value="">Select loan</option>
                        {loans.map((loan) => {
                          if (!isFunding(loan)) return null;
                          const key = loan.data.loanKey ?? loan.id;
                          return (
                            <option key={key} value={key}>
                              {loanLabel(key)} · {loan.data.date} ·{" "}
                              {formatPKR(loanOutstanding(sheet.entries, sheet.lines, key))}{" "}
                              outstanding
                            </option>
                          );
                        })}
                      </select>
                    </label>
                  ) : (
                    <label>
                      Partner
                      <select name="partnerId" defaultValue={priorOut?.partnerId ?? ""} required>
                        <option value="">Select partner</option>
                        {partnerOptions.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                </>
              )}
              <label>
                Date
                <Input
                  type="date"
                  name="date"
                  defaultValue={entry?.data.date ?? dateToday()}
                  required
                />
              </label>
              <label>
                Amount (PKR)
                <Input
                  name="amount"
                  placeholder="e.g. 1,000,000 or 10L"
                  defaultValue={entry?.data.amount.toLocaleString("en-PK")}
                  required
                />
              </label>
              <label>
                {direction === "in" ? "Received into" : "Paid from"}
                <select name="account" defaultValue={entry?.data.account ?? "company_bank"}>
                  <option value="company_bank">Company bank</option>
                  <option value="company_cash">Company cash</option>
                </select>
              </label>
              <label>
                Reference or cheque number
                <Input name="refNo" defaultValue={entry?.data.refNo} maxLength={120} />
              </label>
              <label className="project-full">
                Notes
                <textarea name="notes" defaultValue={entry?.data.notes} maxLength={500} />
              </label>
              {direction === "in" && (
                <label className="project-full">
                  Attachment
                  <Input name="attachment" type="file" />
                </label>
              )}
            </fieldset>
            <div className="project-modal-actions">
              <button type="button" className="projects-secondary" onClick={close} disabled={busy}>
                Cancel
              </button>
              <button className="projects-primary" disabled={busy}>
                Review entry
              </button>
            </div>
          </form>
          {confirmation && (
            <>
              <p className="funding-confirmation">{confirmation.text}</p>
              {entry && <p>The previous entry will be voided and replaced.</p>}
              {confirmation.warnings.map((warning) => (
                <p key={warning} className="project-share-warning">
                  {warning}
                </p>
              ))}
              <div className="project-modal-actions">
                <button
                  type="button"
                  className="projects-secondary"
                  onClick={() => {
                    setConfirmation(undefined);
                    setError("");
                  }}
                  disabled={busy}
                >
                  Back
                </button>
                <button className="projects-primary" onClick={() => void save()} disabled={busy}>
                  {busy ? "Saving..." : "Save entry"}
                </button>
              </div>
            </>
          )}
          {error && (
            <p role="alert" className="project-save-error">
              {error}
            </p>
          )}
        </DialogContent>
      </Dialog>
      {addLender && (
        <LenderEditor
          endpoint={endpoint}
          close={() => setAddLender(false)}
          onAdded={(lender) => {
            onLender(lender);
            setLenderId(lender.id);
          }}
        />
      )}
    </>
  );
}
