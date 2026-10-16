import { useEffect, useRef, useState, type FormEvent } from "react";
import { format } from "date-fns";
import { HardHat, Plus, Pencil, Wallet, MapPin, Phone, History } from "lucide-react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { PaymentAccountSelect, PaymentMethodSelect } from "@/components/PaymentChoices";
import { PaginatedRecords } from "@/components/Pagination";
import { formatPKR } from "@/domain/money";
import { formatDate } from "@/lib/dates";
import { accountName } from "@/domain/bankAccount";
import type { Transaction } from "@/domain/types";
import { readPaymentDetails } from "@/data/repositories/projectPartnersRepository";
import {
  listProjectContractors,
  listContractorPayments,
  saveProjectContractor,
  addContractorPayment,
  type ProjectContractor,
  type ContractorInput,
  type ContractorPaymentInput,
} from "@/data/repositories/projectContractorsRepository";
import "./project-contractors.css";

const today = () => format(new Date(), "yyyy-MM-dd");
const message = (error: unknown) =>
  error instanceof z.ZodError
    ? error.issues[0].message
    : error instanceof Error
      ? error.message
      : String(error);
function contractorId(payment: Transaction) {
  try {
    return JSON.parse(payment.custom).contractor_id as string;
  } catch {
    return "";
  }
}
export function ProjectContractorsPanel({
  projectId,
  onChanged,
}: {
  projectId: string;
  onChanged: () => void;
}) {
  const [people, setPeople] = useState<ProjectContractor[]>([]);
  const [payments, setPayments] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [editor, setEditor] = useState<ProjectContractor | "new" | null>(null);
  const [payee, setPayee] = useState<ProjectContractor | null>(null);
  useEffect(() => {
    let live = true;
    Promise.all([listProjectContractors(projectId), listContractorPayments(projectId)])
      .then(([contractors, rows]) => {
        if (live) {
          setPeople(contractors);
          setPayments(rows);
          setError("");
        }
      })
      .catch((e) => {
        if (live) setError(message(e));
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [projectId, revision]);
  function saved() {
    setEditor(null);
    setPayee(null);
    setRevision((v) => v + 1);
    onChanged();
  }
  const agreed = people.reduce((sum, p) => sum + p.agreed_amount, 0);
  const paid = people.reduce((sum, p) => sum + p.paid, 0);
  return (
    <section className="thekedar-panel" id="project-panel-thekedar" role="tabpanel" aria-labelledby="project-tab-thekedar">
      <header className="thekedar-heading">
        <span className="thekedar-heading-icon">
          <HardHat size={30} />
        </span>
        <div>
          <small>CONSTRUCTION AGREEMENTS</small>
          <h2>Thekedar</h2>
          <p>Who is doing the work, what you agreed, and every payment made.</p>
        </div>
        <Button onClick={() => setEditor("new")}>
          <Plus size={17} /> Add thekedar
        </Button>
      </header>
      {loading ? (
        <p role="status">Loading thekedars…</p>
      ) : error ? (
        <div className="thekedar-empty" role="alert">
          <p>{error}</p>
          <Button variant="outline" onClick={() => setRevision((v) => v + 1)}>
            Retry
          </Button>
        </div>
      ) : (
        <>
          <div className="thekedar-totals">
            <div>
              <small>Agreed construction cost</small>
              <strong>{formatPKR(agreed)}</strong>
              <span>{people.length} thekedar agreements</span>
            </div>
            <div className="is-paid">
              <small>Paid so far</small>
              <strong>{formatPKR(paid)}</strong>
              <span>Included in project construction costs</span>
            </div>
            <div className="is-due">
              <small>Still to pay</small>
              <strong>{formatPKR(agreed - paid)}</strong>
              <span>Agreed amount less recorded payments</span>
            </div>
          </div>
          <p className="thekedar-help">
            Record payments here once. They also appear in Costs, Bank and Profit &amp; Loss. An
            agreement alone is not a payment.
          </p>
          {people.length === 0 ? (
            <div className="thekedar-empty">
              <HardHat size={36} />
              <h3>Add your first thekedar</h3>
              <p>
                Start with their contact details, agreed work and construction amount. Record
                payments as the work progresses.
              </p>
              <Button onClick={() => setEditor("new")}>Add thekedar</Button>
            </div>
          ) : (
            <div className="thekedar-cards">
              {people.map((person) => {
                const history = payments.filter((p) => contractorId(p) === person.id);
                return (
                  <article className="thekedar-card" key={person.id}>
                    <div className="thekedar-card-title">
                      <span className="thekedar-avatar">
                        <HardHat size={24} />
                      </span>
                      <div>
                        <h3>{person.name}</h3>
                        <small>Agreed on {formatDate(person.agreement_date)}</small>
                      </div>
                      <span
                        className={
                          person.paid === person.agreed_amount
                            ? "thekedar-badge is-settled"
                            : "thekedar-badge"
                        }
                      >
                        {person.paid === person.agreed_amount ? "Fully paid" : "Balance remaining"}
                      </span>
                    </div>
                    <div className="thekedar-contact">
                      <span>
                        <Phone size={14} />
                        {person.phone || "No phone added"}
                      </span>
                      <span>
                        <MapPin size={14} />
                        {person.address || "No address added"}
                      </span>
                    </div>
                    <div className="thekedar-scope">
                      <small>Agreed work</small>
                      <p>{person.scope}</p>
                      {person.notes && <p className="thekedar-note">{person.notes}</p>}
                    </div>
                    <div className="thekedar-card-money">
                      <div>
                        <small>Agreed</small>
                        <strong>{formatPKR(person.agreed_amount)}</strong>
                      </div>
                      <div className="is-paid">
                        <small>Paid</small>
                        <strong>{formatPKR(person.paid)}</strong>
                      </div>
                      <div className="is-due">
                        <small>Still to pay</small>
                        <strong>{formatPKR(person.agreed_amount - person.paid)}</strong>
                      </div>
                    </div>
                    <progress
                      max={person.agreed_amount}
                      value={person.paid}
                      aria-label={"Payment progress for " + person.name}
                    />
                    <div className="thekedar-actions">
                      <Button variant="outline" onClick={() => setEditor(person)}>
                        <Pencil size={15} /> Edit agreement
                      </Button>
                      <Button
                        disabled={person.paid >= person.agreed_amount}
                        onClick={() => setPayee(person)}
                      >
                        <Wallet size={16} /> Record payment
                      </Button>
                    </div>
                    <details className="thekedar-history">
                      <summary>
                        <History size={16} /> Payment history <span>{history.length}</span>
                      </summary>
                      {history.length ? (
                        <PaginatedRecords items={history} label="thekedar payments">
                          {(payment) => {
                            const details = readPaymentDetails(payment.custom) ?? {
                              received_by: "",
                              to_bank: "",
                            };
                            return (
                              <article key={payment.id} className="thekedar-payment">
                                <div>
                                  <strong>{formatPKR(payment.amount)}</strong>
                                  <time>{formatDate(payment.date)}</time>
                                </div>
                                <p>
                                  {payment.method} · {accountName(payment.account_key)}
                                </p>
                                <p>
                                  {[
                                    details.received_by && "Received by: " + details.received_by,
                                    details.to_bank,
                                    payment.reference && "Reference: " + payment.reference,
                                  ]
                                    .filter(Boolean)
                                    .join(" · ")}
                                </p>
                                <p>{payment.description}</p>
                              </article>
                            );
                          }}
                        </PaginatedRecords>
                      ) : (
                        <p>No payments recorded yet.</p>
                      )}
                    </details>
                  </article>
                );
              })}
            </div>
          )}
        </>
      )}
      {editor && (
        <ContractorEditor
          projectId={projectId}
          person={editor === "new" ? undefined : editor}
          onClose={() => setEditor(null)}
          onSaved={saved}
        />
      )}
      {payee && <PaymentEditor person={payee} onClose={() => setPayee(null)} onSaved={saved} />}
    </section>
  );
}

function ContractorEditor({
  projectId,
  person,
  onClose,
  onSaved,
}: {
  projectId: string;
  person?: ProjectContractor;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [value, setValue] = useState<ContractorInput>(
    person ?? {
      project_id: projectId,
      name: "",
      phone: "",
      address: "",
      scope: "",
      agreed_amount: 0,
      agreement_date: today(),
      notes: "",
    },
  );
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [error, setError] = useState("");
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await saveProjectContractor(value, person?.id);
      onSaved();
    } catch (cause) {
      setError(message(cause));
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
      <DialogContent className="thekedar-dialog">
        <DialogHeader>
          <DialogTitle>{person ? "Edit thekedar agreement" : "Add thekedar"}</DialogTitle>
          <DialogDescription>
            Save the contractor's details and the total agreed construction cost. Payments are
            recorded separately.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit}>
          <fieldset disabled={busy}>
            <div className="thekedar-fields">
              <label>
                Name *
                <input
                  required
                  autoFocus
                  maxLength={120}
                  value={value.name}
                  onChange={(e) => setValue({ ...value, name: e.target.value })}
                />
              </label>
              <label>
                Phone
                <input
                  type="tel"
                  maxLength={40}
                  value={value.phone}
                  onChange={(e) => setValue({ ...value, phone: e.target.value })}
                />
              </label>
              <label className="full">
                Address
                <textarea
                  rows={2}
                  maxLength={500}
                  value={value.address}
                  onChange={(e) => setValue({ ...value, address: e.target.value })}
                />
              </label>
              <label className="full">
                Agreed construction work *
                <textarea
                  required
                  rows={3}
                  maxLength={1000}
                  placeholder="For example: labour for structure, plaster and finishing"
                  value={value.scope}
                  onChange={(e) => setValue({ ...value, scope: e.target.value })}
                />
              </label>
              <label>
                Agreed amount (Rs) *
                <input
                  required
                  type="number"
                  min={Math.max(1, person?.paid ?? 0)}
                  max={Number.MAX_SAFE_INTEGER}
                  step={1}
                  value={value.agreed_amount || ""}
                  onChange={(e) => setValue({ ...value, agreed_amount: Number(e.target.value) })}
                />
              </label>
              <label>
                Agreement date *
                <input
                  required
                  type="date"
                  value={value.agreement_date}
                  onChange={(e) => setValue({ ...value, agreement_date: e.target.value })}
                />
              </label>
              <label className="full">
                Terms / notes
                <textarea
                  rows={2}
                  maxLength={1000}
                  value={value.notes}
                  onChange={(e) => setValue({ ...value, notes: e.target.value })}
                />
              </label>
            </div>
          </fieldset>
          {error && (
            <p role="alert" className="thekedar-error">
              {error}
            </p>
          )}
          <div className="thekedar-actions">
            <Button type="button" variant="outline" disabled={busy} onClick={onClose}>
              Cancel
            </Button>
            <Button disabled={busy}>{busy ? "Saving…" : "Save agreement"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function PaymentEditor({
  person,
  onClose,
  onSaved,
}: {
  person: ProjectContractor;
  onClose: () => void;
  onSaved: () => void;
}) {
  const remaining = person.agreed_amount - person.paid;
  const [value, setValue] = useState<ContractorPaymentInput>({
    project_id: person.project_id,
    contractor_id: person.id,
    amount: 0,
    date: today(),
    account_key: "builder",
    method: "cash",
    reference: "",
    provider: "",
    received_by: person.name,
    notes: "",
  });
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [error, setError] = useState("");
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await addContractorPayment(value);
      onSaved();
    } catch (cause) {
      setError(message(cause));
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
      <DialogContent className="thekedar-dialog">
        <DialogHeader>
          <DialogTitle>Pay {person.name}</DialogTitle>
          <DialogDescription>
            {formatPKR(remaining)} remains on this agreement. This payment will also be recorded as
            a construction cost.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit}>
          <fieldset disabled={busy}>
            <div className="thekedar-fields">
              <label>
                Payment amount (Rs) *
                <input
                  autoFocus
                  required
                  type="number"
                  min={1}
                  max={remaining}
                  step={1}
                  value={value.amount || ""}
                  onChange={(e) => setValue({ ...value, amount: Number(e.target.value) })}
                />
              </label>
              <label>
                Payment date *
                <input
                  required
                  type="date"
                  min={person.agreement_date}
                  value={value.date}
                  onChange={(e) => setValue({ ...value, date: e.target.value })}
                />
              </label>
            </div>
            <PaymentAccountSelect
              value={value.account_key}
              onChange={(account_key) => setValue({ ...value, account_key })}
            />
            <PaymentMethodSelect
              value={value.method}
              onChange={(method) => setValue({ ...value, method })}
            />
            <div className="thekedar-fields">
              <label>
                Received by *
                <input
                  required
                  maxLength={120}
                  value={value.received_by}
                  onChange={(e) => setValue({ ...value, received_by: e.target.value })}
                />
              </label>
              <label>
                Bank / wallet / service {value.method !== "cash" ? "*" : "(optional)"}
                <input
                  required={value.method !== "cash"}
                  maxLength={120}
                  value={value.provider}
                  onChange={(e) => setValue({ ...value, provider: e.target.value })}
                />
              </label>
              <label className="full">
                Receipt / transfer / cheque reference
                <input
                  maxLength={120}
                  value={value.reference}
                  onChange={(e) => setValue({ ...value, reference: e.target.value })}
                />
              </label>
              <label className="full">
                Payment notes
                <textarea
                  rows={2}
                  maxLength={500}
                  value={value.notes}
                  onChange={(e) => setValue({ ...value, notes: e.target.value })}
                />
              </label>
            </div>
          </fieldset>
          {error && (
            <p role="alert" className="thekedar-error">
              {error}
            </p>
          )}
          <div className="thekedar-actions">
            <Button type="button" variant="outline" disabled={busy} onClick={onClose}>
              Cancel
            </Button>
            <Button disabled={busy}>{busy ? "Saving…" : "Save payment"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
