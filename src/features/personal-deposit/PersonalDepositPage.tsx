import { useEffect, useState, type FormEvent } from "react";
import { format } from "date-fns";
import { ShieldCheck, Plus, ArrowDownLeft, Pencil, Wallet, History, UserRound } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { PaymentAccountSelect } from "@/components/PaymentChoices";
import { useRecordFilters } from "@/components/RecordFilters";
import { PaginatedRecords } from "@/components/Pagination";
import { listContacts } from "@/data/repositories/contactsRepository";
import {
  DepositSchema,
  DepositReturnSchema,
  listPersonalDeposits,
  savePersonalDeposit,
  listDepositReturns,
  addDepositReturn,
  type PersonalDeposit,
  type DepositInput,
  type DepositReturn,
  type DepositReturnInput,
} from "@/data/repositories/personalDepositsRepository";
import { formatPKR, formatPKRInLakhCrore } from "@/domain/money";
import { accountName } from "@/domain/bankAccount";
import { formatDate } from "@/lib/dates";
import "./personal-deposit.css";

import { UdhaarPaymentDetails } from "@/components/UdhaarPaymentDetails";
import {
  emptyPaymentDetails,
  PaymentDetailsSchema,
  paymentSummary,
} from "@/domain/udhaarPaymentDetails";
import {
  listAmanatReceipts,
  saveAmanatReceipt,
  type DocumentRecord,
} from "@/data/repositories/documentsRepository";
import {
  SelectedImagePreviews,
  SavedImageGallery,
} from "@/features/documents/components/ImageGallery";
function initialDetails(raw?: string | null) {
  try {
    return PaymentDetailsSchema.parse(JSON.parse(raw || ""));
  } catch {
    return { ...emptyPaymentDetails };
  }
}
const sourceNames = {
  savings: "Personal savings",
  partner: "Partner payment",
  other: "Other source",
};
const blank = (): DepositInput => ({
  holder_name: "",
  phone: "",
  amount: 0,
  deposit_date: format(new Date(), "yyyy-MM-dd"),
  source: "savings",
  source_details: "",
  reason: "",
  account_key: "personal",
  method: "cash",
});
const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));

export function PersonalDepositPage() {
  const [records, setRecords] = useState<PersonalDeposit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<"held" | "returned" | "all">("held");
  const [editor, setEditor] = useState<PersonalDeposit | "new" | null>(null);
  const [returnFor, setReturnFor] = useState<PersonalDeposit | null>(null);
  const [historyFor, setHistoryFor] = useState<PersonalDeposit | null>(null);
  useEffect(() => {
    let active = true;
    listPersonalDeposits()
      .then((rows) => {
        if (active) setRecords(rows);
      })
      .catch(() => {
        if (active) setError("Could not load personal deposits. Try refreshing.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);
  async function refresh() {
    setError("");
    try {
      setRecords(await listPersonalDeposits());
    } catch {
      setError("Could not refresh deposits. Reopen this page to load the latest records.");
    }
  }
  const filtered = records.filter(
    (row) =>
      tab === "all" ||
      (tab === "held" ? row.returned_amount < row.amount : row.returned_amount >= row.amount),
  );
  const filters = useRecordFilters(filtered, {
    label: "deposits",
    searchText: (row) => [row.holder_name, row.phone, row.reason, row.source_details].join(" "),
    date: (row) => row.deposit_date,
    dateLabel: "Deposited",
    amount: (row) => row.amount,
    facets: [{ label: "Money source", value: (row) => sourceNames[row.source] }],
  });
  const deposited = records.reduce((total, row) => total + row.amount, 0);
  const returned = records.reduce((total, row) => total + row.returned_amount, 0);
  return (
    <div className="amanat-page">
      <header className="amanat-heading">
        <span className="amanat-heading-icon">
          <ShieldCheck size={32} />
        </span>
        <div>
          <small>YOUR MONEY, KEPT IN TRUST · امانت</small>
          <h1>Personal Deposit / Amanat</h1>
          <p>Keep a record of money you leave with someone for safekeeping.</p>
        </div>
        <Button onClick={() => setEditor("new")}>
          <Plus size={18} /> Add deposit
        </Button>
      </header>
      {loading ? (
        <p role="status">Loading personal deposits…</p>
      ) : error ? (
        <div role="alert" className="amanat-empty">
          {error}
          <Button variant="outline" onClick={() => void refresh()}>
            Refresh deposits
          </Button>
        </div>
      ) : (
        <>
          <div className="amanat-metrics">
            {[
              { label: "Total deposited", amount: deposited, icon: Wallet },
              { label: "Returned to you", amount: returned, icon: ArrowDownLeft },
              { label: "Still held for you", amount: deposited - returned, icon: ShieldCheck },
            ].map(({ label, amount, icon: Icon }) => (
              <article key={label}>
                <span className="amanat-metric-icon">
                  <Icon size={24} />
                </span>
                <span>{label}</span>
                <strong>{formatPKRInLakhCrore(amount)}</strong>
                <small>Across all your saved deposits</small>
              </article>
            ))}
          </div>
          <div className="amanat-list-heading">
            <div>
              <small>YOUR SAFEKEEPING RECORDS</small>
              <h2>Money with people</h2>
              <p>See who holds your money and what has been returned.</p>
            </div>
            <span>{records.length} deposits</span>
          </div>
          <div className="amanat-toolbar">
            <div role="group" aria-label="Deposit status">
              {(["held", "returned", "all"] as const).map((value) => (
                <button
                  type="button"
                  key={value}
                  aria-pressed={tab === value}
                  onClick={() => setTab(value)}
                >
                  {value === "held" ? (
                    <ShieldCheck size={19} />
                  ) : value === "returned" ? (
                    <ArrowDownLeft size={19} />
                  ) : (
                    <History size={19} />
                  )}
                  {value === "held"
                    ? "Still held"
                    : value === "returned"
                      ? "Fully returned"
                      : "All deposits"}
                </button>
              ))}
            </div>
            <span>{filters.visible.length} deposits</span>
          </div>
          <details className="amanat-filters">
            <summary>Search & filter deposits</summary>
            {filters.controls}
          </details>
          {filters.pagination}
          {filters.visible.length ? (
            <div className="amanat-grid">
              {filters.pageItems.map((row) => (
                <article
                  className={`amanat-card ${row.amount === row.returned_amount ? "is-returned" : "is-held"}`}
                  key={row.id}
                >
                  <div className="amanat-card-head">
                    <span>
                      <UserRound size={23} />
                    </span>
                    <div>
                      <h2>{row.holder_name}</h2>
                      <p>{row.phone || "Money held for safekeeping"}</p>
                    </div>
                    <b>{row.amount === row.returned_amount ? "Returned" : "In safekeeping"}</b>
                  </div>
                  <div className="amanat-held">
                    <small>Still with {row.holder_name}</small>
                    <strong>{formatPKR(row.amount - row.returned_amount)}</strong>
                  </div>
                  <div className="amanat-progress-caption">
                    <span>Returned to you</span>
                    <strong>{Math.round((row.returned_amount / row.amount) * 100)}%</strong>
                  </div>
                  <progress
                    className="amanat-progress"
                    aria-label={`Money returned by ${row.holder_name}`}
                    value={row.returned_amount}
                    max={row.amount}
                  />
                  <dl>
                    <div>
                      <dt>Deposited</dt>
                      <dd>{formatPKR(row.amount)}</dd>
                    </div>
                    <div>
                      <dt>Returned</dt>
                      <dd>{formatPKR(row.returned_amount)}</dd>
                    </div>
                    <div>
                      <dt>Date</dt>
                      <dd>{formatDate(row.deposit_date)}</dd>
                    </div>
                    <div>
                      <dt>Paid from</dt>
                      <dd>
                        {accountName(row.account_key)} · {row.method}
                      </dd>
                    </div>
                    <div>
                      <dt>Source of money</dt>
                      <dd>
                        {sourceNames[row.source]}
                        {row.source_details && ` · ${row.source_details}`}
                      </dd>
                    </div>
                  </dl>
                  <div className="amanat-reason">
                    <small>Reason / note</small>
                    <p>{row.reason || "No reason added"}</p>
                  </div>
                  <footer>
                    <Button variant="outline" onClick={() => setEditor(row)}>
                      <Pencil size={15} /> Edit
                    </Button>
                    <Button variant="outline" onClick={() => setHistoryFor(row)}>
                      <History size={15} /> History
                    </Button>
                    {row.returned_amount < row.amount && (
                      <Button onClick={() => setReturnFor(row)}>
                        <ArrowDownLeft size={16} /> Record return
                      </Button>
                    )}
                  </footer>
                </article>
              ))}
            </div>
          ) : (
            <div className="amanat-empty">
              <ShieldCheck size={36} />
              <h2>{records.length ? "No deposits match this view" : "Your Amanat starts here"}</h2>
              <p>
                {records.length
                  ? "Try another status or clear your filters."
                  : "Record who is keeping your money, where it came from, and why you left it with them."}
              </p>
              <Button onClick={() => setEditor("new")}>Add deposit</Button>
            </div>
          )}
        </>
      )}
      {editor && (
        <DepositEditor
          record={editor === "new" ? undefined : editor}
          onClose={() => setEditor(null)}
          onSaved={() => {
            setEditor(null);
            void refresh();
          }}
        />
      )}
      {returnFor && (
        <ReturnEditor
          record={returnFor}
          onClose={() => setReturnFor(null)}
          onSaved={() => {
            setReturnFor(null);
            void refresh();
          }}
        />
      )}
      {historyFor && <ReturnHistory record={historyFor} onClose={() => setHistoryFor(null)} />}
    </div>
  );
}

function DepositEditor({
  record,
  onClose,
  onSaved,
}: {
  record?: PersonalDeposit;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [value, setValue] = useState<DepositInput>(record || blank());
  const [details, setDetails] = useState(() => ({
    ...initialDetails(record?.payment_details),
    method: record?.method || ("cash" as const),
  }));
  const [files, setFiles] = useState<File[]>([]);
  const [savedId, setSavedId] = useState<string>();
  const [contacts, setContacts] = useState<{ name: string; phone: string | null }[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    listContacts()
      .then((rows) => {
        if (active) setContacts(rows);
      })
      .catch(() => {
        /* Free-text entry remains available. */
      });
    return () => {
      active = false;
    };
  }, []);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    const parsed = DepositSchema.safeParse({
      ...value,
      method: details.method,
      payment_details: JSON.stringify(details),
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }
    if (record && value.amount < record.returned_amount) {
      setError("Deposit amount cannot be less than money already returned.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const id = savedId || (await savePersonalDeposit(parsed.data, record?.id));
      setSavedId(id);
      await uploadReceipts(
        id,
        "personal_deposit",
        files,
        value.deposit_date,
        details.method,
        setFiles,
      );
      toast.success(record ? "Deposit updated" : "Amanat deposit saved");
      onSaved();
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) {
          if (savedId) onSaved();
          else onClose();
        }
      }}
    >
      <DialogContent className="amanat-dialog">
        <DialogHeader>
          <span className="amanat-dialog-icon">
            <ShieldCheck size={26} aria-hidden="true" />
          </span>
          <DialogTitle>{record ? "Edit deposit" : "Add personal deposit"}</DialogTitle>
          <DialogDescription>
            Record money given to someone to keep safely. A source note does not create another
            partner payment.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit}>
          <fieldset disabled={busy || !!savedId}>
            <div className="amanat-form-section-title">
              <UserRound size={18} />
              <h3>Person & amount</h3>
            </div>
            <div className="amanat-fields">
              <label>
                Who is keeping the money? *
                <input
                  autoFocus
                  required
                  maxLength={120}
                  list="amanat-contacts"
                  value={value.holder_name}
                  onChange={(event) => setValue({ ...value, holder_name: event.target.value })}
                  placeholder="Choose a contact or type any name"
                />
                <datalist id="amanat-contacts">
                  {contacts.map((contact, index) => (
                    <option key={index} value={contact.name}>
                      {contact.phone || "Saved contact"}
                    </option>
                  ))}
                </datalist>
              </label>
              <label>
                Phone (optional)
                <input
                  maxLength={40}
                  value={value.phone}
                  onChange={(event) => setValue({ ...value, phone: event.target.value })}
                />
              </label>
              <label>
                Amount (Rs) *
                <input
                  type="number"
                  min={1}
                  step={1}
                  max={Number.MAX_SAFE_INTEGER}
                  required
                  value={value.amount || ""}
                  onChange={(event) => setValue({ ...value, amount: Number(event.target.value) })}
                />
              </label>
              <label>
                Deposit date *
                <input
                  type="date"
                  required
                  value={value.deposit_date}
                  onChange={(event) => setValue({ ...value, deposit_date: event.target.value })}
                />
              </label>
              <label>
                Source of money
                <select
                  value={value.source}
                  onChange={(event) =>
                    setValue({ ...value, source: event.target.value as DepositInput["source"] })
                  }
                >
                  {Object.entries(sourceNames).map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Source details {value.source !== "savings" ? "*" : "(optional)"}
                <input
                  required={value.source !== "savings"}
                  maxLength={500}
                  value={value.source_details}
                  onChange={(event) => setValue({ ...value, source_details: event.target.value })}
                  placeholder="e.g. Ahmed’s payment for Residency"
                />
              </label>
            </div>
            <label className="amanat-note-label">
              Reason / note
              <textarea
                rows={3}
                maxLength={1000}
                value={value.reason}
                onChange={(event) => setValue({ ...value, reason: event.target.value })}
                placeholder="Why are you leaving this money with them? You can write in Urdu or English."
              />
            </label>
            <PaymentAccountSelect
              value={value.account_key}
              onChange={(account_key) => setValue({ ...value, account_key })}
            />
            <div className="amanat-payment-details">
              <UdhaarPaymentDetails value={details} onChange={setDetails} />
            </div>
            <ReceiptPicker files={files} onChange={setFiles} />
          </fieldset>
          {savedId && (
            <p role="status">Payment saved. Retry the remaining images, or finish without them.</p>
          )}
          {error && (
            <p role="alert" className="amanat-error">
              {error}
            </p>
          )}
          <div className="amanat-form-actions">
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={savedId ? onSaved : onClose}
            >
              {savedId ? "Finish" : "Cancel"}
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? "Saving…" : savedId ? "Retry images" : "Save deposit"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ReturnEditor({
  record,
  onClose,
  onSaved,
}: {
  record: PersonalDeposit;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [details, setDetails] = useState({ ...emptyPaymentDetails });
  const [files, setFiles] = useState<File[]>([]);
  const [savedId, setSavedId] = useState<string>();
  const balance = record.amount - record.returned_amount;
  const [value, setValue] = useState<DepositReturnInput>({
    deposit_id: record.id,
    amount: balance,
    return_date: format(new Date(), "yyyy-MM-dd"),
    method: "cash",
    account_key: "personal",
    notes: "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    const parsed = DepositReturnSchema.safeParse({
      ...value,
      method: details.method,
      payment_details: JSON.stringify(details),
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }
    if (value.amount > balance || value.return_date < record.deposit_date) {
      setError(
        "Check the amount and date. A return cannot exceed the amount held or be before the deposit.",
      );
      return;
    }
    setBusy(true);
    setError("");
    try {
      const id = savedId || (await addDepositReturn(parsed.data));
      setSavedId(id);
      await uploadReceipts(
        id,
        "deposit_return",
        files,
        value.return_date,
        details.method,
        setFiles,
      );
      toast.success("Return recorded");
      onSaved();
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) {
          if (savedId) onSaved();
          else onClose();
        }
      }}
    >
      <DialogContent className="amanat-dialog">
        <DialogHeader>
          <span className="amanat-dialog-icon">
            <ShieldCheck size={26} aria-hidden="true" />
          </span>
          <DialogTitle>Record money returned</DialogTitle>
          <DialogDescription>
            {record.holder_name} still holds {formatPKR(balance)}. Record a partial or full return.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit}>
          <fieldset disabled={busy || !!savedId}>
            <div className="amanat-form-section-title">
              <UserRound size={18} />
              <h3>Person & amount</h3>
            </div>
            <div className="amanat-fields">
              <label>
                Returned amount (Rs) *
                <input
                  autoFocus
                  required
                  type="number"
                  min={1}
                  max={balance}
                  step={1}
                  value={value.amount || ""}
                  onChange={(event) => setValue({ ...value, amount: Number(event.target.value) })}
                />
              </label>
              <label>
                Return date *
                <input
                  required
                  type="date"
                  min={record.deposit_date}
                  value={value.return_date}
                  onChange={(event) => setValue({ ...value, return_date: event.target.value })}
                />
              </label>
            </div>
            <label className="amanat-note-label">
              Return note
              <textarea
                rows={3}
                maxLength={1000}
                value={value.notes}
                onChange={(event) => setValue({ ...value, notes: event.target.value })}
              />
            </label>
            <PaymentAccountSelect
              direction="in"
              value={value.account_key}
              onChange={(account_key) => setValue({ ...value, account_key })}
            />
            <div className="amanat-payment-details">
              <UdhaarPaymentDetails value={details} onChange={setDetails} />
            </div>
            <ReceiptPicker files={files} onChange={setFiles} />
          </fieldset>
          {savedId && (
            <p role="status">Payment saved. Retry the remaining images, or finish without them.</p>
          )}
          {error && (
            <p role="alert" className="amanat-error">
              {error}
            </p>
          )}
          <div className="amanat-form-actions">
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={savedId ? onSaved : onClose}
            >
              {savedId ? "Finish" : "Cancel"}
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? "Saving…" : savedId ? "Retry images" : "Save return"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ReturnHistory({ record, onClose }: { record: PersonalDeposit; onClose: () => void }) {
  const [rows, setRows] = useState<DepositReturn[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    listDepositReturns(record.id)
      .then((value) => {
        if (active) setRows(value);
      })
      .catch(() => {
        if (active) setError("Could not load returns. Close and reopen this history to retry.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [record.id]);
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="amanat-dialog">
        <DialogHeader>
          <span className="amanat-dialog-icon">
            <ShieldCheck size={26} aria-hidden="true" />
          </span>
          <DialogTitle>{record.holder_name} · Deposit history</DialogTitle>
          <DialogDescription>
            {formatPKR(record.amount)} deposited on {formatDate(record.deposit_date)}.
          </DialogDescription>
        </DialogHeader>
        <p>{paymentSummary(record.payment_details)}</p>
        <AmanatReceipts ownerId={record.id} />
        {loading ? (
          <p role="status">Loading returns…</p>
        ) : error ? (
          <p role="alert">{error}</p>
        ) : rows.length ? (
          <div className="amanat-history">
            <PaginatedRecords items={rows} label="deposit returns">
              {(row) => (
                <article key={row.id}>
                  <div>
                    <strong>{formatPKR(row.amount)} returned</strong>
                    <small>
                      {formatDate(row.return_date)} · {accountName(row.account_key)} · {row.method}
                    </small>
                    {row.notes && <p>{row.notes}</p>}
                    <p>{paymentSummary(row.payment_details)}</p>
                    <AmanatReceipts ownerId={row.id} />
                  </div>
                </article>
              )}
            </PaginatedRecords>
          </div>
        ) : (
          <p>No returns recorded yet.</p>
        )}
      </DialogContent>
    </Dialog>
  );
}

async function uploadReceipts(
  id: string,
  type: "personal_deposit" | "deposit_return",
  files: File[],
  date: string,
  method: string,
  setFiles: (files: File[]) => void,
) {
  const failed: File[] = [];
  for (const file of files) {
    try {
      await saveAmanatReceipt(id, type, file, date, method);
    } catch {
      failed.push(file);
    }
  }
  setFiles(failed);
  if (failed.length)
    throw new Error(
      "Payment saved, but these images could not be saved: " +
        failed.map((file) => file.name).join(", ") +
        ". Retry images without recording the payment again.",
    );
}
function ReceiptPicker({ files, onChange }: { files: File[]; onChange: (files: File[]) => void }) {
  const [error, setError] = useState("");
  return (
    <section className="amanat-receipts">
      <label>
        Payment receipt images (optional)
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          multiple
          onChange={(event) => {
            const selected = Array.from(event.target.files || []);
            if (
              selected.some(
                (file) =>
                  !["image/jpeg", "image/png", "image/webp", "image/gif"].includes(file.type) ||
                  !file.size ||
                  file.size > 10 * 1024 * 1024,
              )
            )
              setError("Choose JPG, PNG, WebP or GIF images up to 10 MB each.");
            else {
              onChange([...files, ...selected]);
              setError("");
            }
            event.target.value = "";
          }}
        />
      </label>
      <p>
        Attach a cash receipt, transfer screenshot, wallet confirmation or cheque image. Up to 10 MB
        per image.
      </p>
      {error && <p role="alert">{error}</p>}
      <SelectedImagePreviews files={files} />
      {files.map((file, index) => (
        <button
          type="button"
          key={index}
          onClick={() => onChange(files.filter((_, i) => i !== index))}
        >
          Remove {file.name}
        </button>
      ))}
    </section>
  );
}
function AmanatReceipts({ ownerId }: { ownerId: string }) {
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    listAmanatReceipts(ownerId)
      .then((rows) => {
        if (active) setDocuments(rows);
      })
      .catch(() => {
        if (active) setError("Could not load receipt images. Reopen history to retry.");
      });
    return () => {
      active = false;
    };
  }, [ownerId]);
  return (
    <>
      {error && <p role="alert">{error}</p>}
      <SavedImageGallery documents={documents} />
    </>
  );
}
