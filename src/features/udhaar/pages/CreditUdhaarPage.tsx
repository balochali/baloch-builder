import { useEffect, useMemo, useState, type FormEvent } from "react";
import { format } from "date-fns";
import { ArrowRight, CalendarDays, CircleCheck, HandCoins, Plus, Search, UserRound, Wallet } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatPKR, formatPKRInLakhCrore } from "@/domain/money";
import { formatDate } from "@/lib/dates";
import { AddUdhaarPaymentSchema, CreateUdhaarSchema, addUdhaarPayment, createUdhaar, listUdhaarPayments, listUdhaars,
  type AddUdhaarPaymentInput, type CreateUdhaarInput, type Udhaar, type UdhaarPayment } from "@/data/repositories/udhaarRepository";

function rupees(value: string): number | null {
  const trimmed = value.trim();
  if (!/^\d+(?:,\d+)*$/.test(trimmed)) return null;
  const amount = Number(trimmed.replace(/,/g, ""));
  return Number.isSafeInteger(amount) && amount > 0 ? amount : null;
}

const today = () => format(new Date(), "yyyy-MM-dd");

export function CreditUdhaarPage() {
  const [records, setRecords] = useState<Udhaar[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [view, setView] = useState<"overview" | "people">("overview");
  const [addOpen, setAddOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [payments, setPayments] = useState<UdhaarPayment[]>([]);
  const [paymentsLoading, setPaymentsLoading] = useState(false);
  const [paymentsError, setPaymentsError] = useState("");
  const selected = records.find((record) => record.id === selectedId) ?? null;
  const visible = useMemo(() => records.filter((record) =>
    `${record.borrower_name} ${record.phone ?? ""}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())), [records, search]);
  const totalLent = records.reduce((total, record) => total + record.amount, 0);
  const totalPaid = records.reduce((total, record) => total + record.paid_amount, 0);
  const totalRemaining = Math.max(0, totalLent - totalPaid);
  const paidPercent = totalLent > 0 ? Math.min(100, totalPaid / totalLent * 100) : 0;
  const largestBalances = [...records].filter((record) => record.amount > record.paid_amount)
    .sort((a, b) => (b.amount - b.paid_amount) - (a.amount - a.paid_amount)).slice(0, 4);
  const largestBalance = largestBalances[0] ? largestBalances[0].amount - largestBalances[0].paid_amount : 0;

  useEffect(() => {
    let active = true;
    listUdhaars().then((rows) => { if (active) setRecords(rows); })
      .catch((cause) => { if (active) setError(String(cause)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  async function refresh() { setRecords(await listUdhaars()); }
  async function addRecord(value: CreateUdhaarInput) {
    await createUdhaar(value);
    toast.success("Udhaar recorded");
    try { await refresh(); }
    catch { toast.error("Saved. Refresh the page to see the latest records."); }
  }
  async function addPayment(value: AddUdhaarPaymentInput) {
    await addUdhaarPayment(value);
    toast.success("Repayment recorded");
    try {
      await refresh();
      setPayments(await listUdhaarPayments(value.udhaar_id));
    } catch { toast.error("Saved. Refresh the page to see the latest balance."); }
  }
  async function openDetails(id: string) {
    setSelectedId(id);
    setPayments([]);
    setPaymentsError("");
    setPaymentsLoading(true);
    try { setPayments(await listUdhaarPayments(id)); }
    catch (cause) { setPaymentsError(`Could not load repayments: ${String(cause)}`); }
    finally { setPaymentsLoading(false); }
  }

  return <main className="udhaar-page">
    <div className="udhaar-heading"><div><p className="projects-eyebrow">MONEY YOU GAVE</p><h1>Credit / Udhaar</h1><p>See who owes you money, how much has come back, and what is still due.</p></div>
      <Button onClick={() => setAddOpen(true)}><Plus size={18} />Give Udhaar</Button></div>
    <div className="udhaar-tabs" role="tablist" aria-label="Credit and Udhaar views">
      {(["overview", "people"] as const).map((tab, index) => <button type="button" role="tab" key={tab} id={`udhaar-tab-${tab}`} aria-selected={view === tab} aria-controls={`udhaar-panel-${tab}`} tabIndex={view === tab ? 0 : -1}
        onClick={() => setView(tab)} onKeyDown={(event) => {
          const next = event.key === "ArrowRight" ? (index + 1) % 2 : event.key === "ArrowLeft" ? (index + 1) % 2 : event.key === "Home" ? 0 : event.key === "End" ? 1 : -1;
          if (next >= 0) { event.preventDefault(); const target = next === 0 ? "overview" : "people"; setView(target); document.getElementById(`udhaar-tab-${target}`)?.focus(); }
        }}>{tab === "overview" ? "Overview" : "People & balances"}{tab === "people" && records.length > 0 && <span>{records.length}</span>}</button>)}
    </div>
    {loading && <p className="py-8 text-muted-foreground">Loading udhaar records…</p>}
    {!loading && error && <p role="alert" className="py-8 text-destructive">Could not load udhaar records: {error}</p>}
    {!loading && !error && <>
      {view === "overview" && <section id="udhaar-panel-overview" role="tabpanel" aria-labelledby="udhaar-tab-overview" className="udhaar-tab-panel">
      <div className="udhaar-summary">
        <div className="udhaar-summary-given"><span className="udhaar-summary-icon"><HandCoins size={23} /></span><span>Total given</span><strong>{formatPKRInLakhCrore(totalLent)}</strong><small>{totalLent >= 100_000 ? `${formatPKR(totalLent, { lakhCrore: true })} in full` : "Money you lent"}</small></div>
        <div className="udhaar-summary-paid"><span className="udhaar-summary-icon"><CircleCheck size={23} /></span><span>Paid back</span><strong>{formatPKRInLakhCrore(totalPaid)}</strong><small>{totalPaid >= 100_000 ? `${formatPKR(totalPaid, { lakhCrore: true })} in full` : "Money received from people"}</small></div>
        <div className="udhaar-summary-remaining"><span className="udhaar-summary-icon"><Wallet size={23} /></span><span>Still to receive</span><strong>{formatPKRInLakhCrore(totalRemaining)}</strong><small>{totalRemaining >= 100_000 ? `${formatPKR(totalRemaining, { lakhCrore: true })} in full` : "Money people still owe you"}</small></div>
      </div>
      {records.length > 0 && <section className="udhaar-insights" aria-label="Udhaar at a glance">
        <div className="udhaar-insight-intro"><p className="projects-eyebrow">AT A GLANCE</p><h2>How much has come back?</h2><p>Blue shows money paid back. Gold shows money still to receive.</p></div>
        <div className="udhaar-insight-body"><div className="udhaar-donut-layout">
          <div className="udhaar-donut" role="img" aria-label={`${formatPKR(totalPaid)} paid back and ${formatPKR(totalRemaining)} still to receive`} style={{ background: `conic-gradient(#49b9a2 0 ${paidPercent}%, #e8b941 ${paidPercent}% 100%)` }}><span><strong>{Math.round(paidPercent)}%</strong><small>paid back</small></span></div>
          <div className="udhaar-donut-legend"><div><i className="is-paid" /><span>Paid back</span><strong>{formatPKRInLakhCrore(totalPaid)}</strong></div><div><i className="is-remaining" /><span>Still to receive</span><strong>{formatPKRInLakhCrore(totalRemaining)}</strong></div><p>Out of {formatPKRInLakhCrore(totalLent)} given in total.</p></div>
        </div><div className="udhaar-balance-chart"><h3>Largest amounts still due</h3><p>People with the most money left to return.</p>{largestBalances.length === 0 ? <span className="udhaar-all-paid">Everyone has paid back in full.</span> : largestBalances.map((record) => {
          const balance = record.amount - record.paid_amount;
          return <div className="udhaar-balance-row" key={record.id}><div><strong>{record.borrower_name}</strong><span>{formatPKRInLakhCrore(balance)}</span></div><span className="udhaar-balance-track"><span style={{ width: `${balance / largestBalance * 100}%` }} /></span></div>;
        })}</div></div>
      </section>}
      {records.length === 0 && <div className="udhaar-empty"><HandCoins size={34} /><h2>Your overview starts here</h2><p>Add the first udhaar to see how much has been given and paid back.</p><Button onClick={() => setAddOpen(true)}><Plus size={17} />Give Udhaar</Button></div>}
      {records.length > 0 && <Button variant="outline" className="udhaar-view-people" onClick={() => setView("people")}>See people and remaining balances <ArrowRight size={17} /></Button>}
      </section>}
      {view === "people" && <section id="udhaar-panel-people" role="tabpanel" aria-labelledby="udhaar-tab-people" className="udhaar-tab-panel">
      <div className="udhaar-list-heading"><div><h2>People who owe you</h2><p>Select a person to see payments and record money received.</p></div><span>{records.length} {records.length === 1 ? "record" : "records"}</span></div>
      {records.length > 0 && <div className="relative udhaar-search"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input aria-label="Search udhaar records" placeholder="Search by name or phone…" className="pl-9" value={search} onChange={(event) => setSearch(event.target.value)} /></div>}
      {records.length === 0 ? <div className="udhaar-empty"><HandCoins size={34} /><h2>No udhaar recorded yet</h2><p>Start by adding the name, amount and date for money you have given.</p><Button onClick={() => setAddOpen(true)}><Plus size={17} />Give Udhaar</Button></div> :
        visible.length === 0 ? <p className="rounded-xl border p-8 text-center text-muted-foreground">No udhaar records match your search.</p> :
          <div className="udhaar-cards">{visible.map((record) => {
            const remaining = Math.max(0, record.amount - record.paid_amount);
            const percent = Math.min(100, record.paid_amount / record.amount * 100);
            return <button className={`udhaar-card ${remaining === 0 ? "is-settled" : record.paid_amount > 0 ? "is-partial" : "is-unpaid"}`} type="button" key={record.id} onClick={() => openDetails(record.id)} aria-label={`View ${record.borrower_name}'s udhaar`}>
              <span className="udhaar-card-top"><span className="udhaar-avatar"><UserRound size={25} /></span><span className="udhaar-card-person"><strong>{record.borrower_name}</strong><small>{record.phone || "Phone not added"}</small></span><ArrowRight size={19} /></span>
              <span className="udhaar-card-status">{remaining === 0 ? <><CircleCheck size={15} />Paid in full</> : record.paid_amount > 0 ? "Partly paid" : "Not paid yet"}</span>
              <span className="udhaar-card-amount"><small>Still to receive</small><strong>{formatPKRInLakhCrore(remaining)}</strong>{remaining >= 100_000 && <em>{formatPKR(remaining, { lakhCrore: true })} exactly</em>}</span>
              <span className="udhaar-progress-caption"><span>Repayment progress</span><strong>{Math.round(percent)}% paid</strong></span>
              <span className="udhaar-progress" role="img" aria-label={`${formatPKR(record.paid_amount)} repaid out of ${formatPKR(record.amount)}`}><span style={{ width: `${percent}%` }} /></span>
              <span className="udhaar-card-split"><span>Given <strong>{formatPKRInLakhCrore(record.amount)}</strong></span><span>Paid back <strong>{formatPKRInLakhCrore(record.paid_amount)}</strong></span></span>
              <span className="udhaar-card-date"><CalendarDays size={14} />Given {formatDate(record.given_date)}{record.due_date ? ` · Due ${formatDate(record.due_date)}` : ""}</span>
              <span className="udhaar-card-action">View details <ArrowRight size={16} /></span>
            </button>;
          })}</div>}
      </section>}
    </>}
    {addOpen && <UdhaarForm onClose={() => setAddOpen(false)} onSave={addRecord} />}
    <Dialog open={!!selected && !paymentOpen} onOpenChange={(open) => { if (!open) setSelectedId(null); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        {selected && <><DialogHeader><DialogTitle>{selected.borrower_name}'s udhaar</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">{selected.phone || "No phone number saved"} · Given {formatDate(selected.given_date)}{selected.due_date ? ` · Due ${formatDate(selected.due_date)}` : ""}</p>
          <div className="udhaar-detail-totals"><div><span>Given</span><strong>{formatPKR(selected.amount)}</strong></div><div><span>Paid back</span><strong>{formatPKR(selected.paid_amount)}</strong></div><div><span>Remaining</span><strong>{formatPKR(Math.max(0, selected.amount - selected.paid_amount))}</strong></div></div>
          {selected.notes && <p className="rounded-lg bg-muted p-3 text-sm">{selected.notes}</p>}
          <div className="udhaar-history-heading"><h3>Repayment history</h3><span>{selected.payment_count} {selected.payment_count === 1 ? "payment" : "payments"}</span></div>
          {paymentsError && <p role="alert" className="text-sm text-destructive">{paymentsError}</p>}
          {paymentsLoading ? <p className="rounded-lg border p-4 text-sm text-muted-foreground">Loading repayments…</p> : payments.length === 0 && !paymentsError ? <p className="rounded-lg border p-4 text-sm text-muted-foreground">No repayments recorded yet.</p> : <div className="udhaar-history">{payments.map((payment) => <div key={payment.id}><span><strong>{formatDate(payment.paid_date)}</strong><small>{payment.method || "Other"}{payment.notes ? ` · ${payment.notes}` : ""}</small></span><strong>{formatPKR(payment.amount)}</strong></div>)}</div>}
          <DialogFooter><Button variant="outline" onClick={() => setSelectedId(null)}>Close</Button>{selected.amount > selected.paid_amount && <Button onClick={() => setPaymentOpen(true)}><Plus size={17} />Record repayment</Button>}</DialogFooter>
        </>}
      </DialogContent>
    </Dialog>
    {selected && paymentOpen && <RepaymentForm record={selected} onClose={() => setPaymentOpen(false)} onSave={addPayment} />}
  </main>;
}

function UdhaarForm({ onClose, onSave }: { onClose: () => void; onSave: (value: CreateUdhaarInput) => Promise<void> }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [amount, setAmount] = useState("");
  const [givenDate, setGivenDate] = useState(today());
  const [dueDate, setDueDate] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError("");
    const result = CreateUdhaarSchema.safeParse({ borrower_name: name, phone, amount: rupees(amount), given_date: givenDate, due_date: dueDate || null, notes });
    if (!result.success) { setError(result.error.issues[0]?.message ?? "Check the details."); return; }
    setSaving(true);
    try { await onSave(result.data); onClose(); }
    catch (cause) { setError(`Could not save udhaar: ${String(cause)}`); }
    finally { setSaving(false); }
  }
  return <Dialog open onOpenChange={(open) => { if (!open && !saving) onClose(); }}>
    <DialogContent className="udhaar-entry-dialog max-h-[92vh] overflow-y-auto sm:max-w-2xl">
      <DialogHeader className="udhaar-entry-header">
        <span className="udhaar-entry-icon"><HandCoins size={26} aria-hidden="true" /></span>
        <div><p className="udhaar-entry-eyebrow">NEW MONEY LENT</p><DialogTitle>Give Udhaar</DialogTitle>
          <p>Write down who received the money and when. You can record repayments later.</p></div>
      </DialogHeader>
      <form id="udhaar-form" onSubmit={submit} className="udhaar-entry-form">
        <section className="udhaar-entry-section" aria-labelledby="udhaar-person-heading">
          <div className="udhaar-entry-section-title"><span>1</span><div><h3 id="udhaar-person-heading">Who received the money?</h3><p>Use the name you will recognize later.</p></div></div>
          <div className="udhaar-entry-grid"><div className="udhaar-entry-field"><Label htmlFor="udhaar-name">Person's name *</Label><Input id="udhaar-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Ali Baloch" autoFocus required /></div>
            <div className="udhaar-entry-field"><Label htmlFor="udhaar-phone">Phone (optional)</Label><Input id="udhaar-phone" type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="e.g. 0300 1234567" /></div></div>
        </section>
        <section className="udhaar-entry-section" aria-labelledby="udhaar-money-heading">
          <div className="udhaar-entry-section-title"><span>2</span><div><h3 id="udhaar-money-heading">How much did you give?</h3><p>Enter the amount and the day you handed it over.</p></div></div>
          <div className="udhaar-entry-field udhaar-entry-amount"><Label htmlFor="udhaar-amount">Amount given (Rs) *</Label><Input id="udhaar-amount" inputMode="numeric" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="e.g. 50,000" aria-describedby="udhaar-amount-help" required /><small id="udhaar-amount-help">Whole rupees only. Repayments will reduce this balance.</small></div>
          <div className="udhaar-entry-grid"><div className="udhaar-entry-field"><Label htmlFor="udhaar-date">Date given *</Label><Input id="udhaar-date" type="date" value={givenDate} onChange={(event) => setGivenDate(event.target.value)} required /></div><div className="udhaar-entry-field"><Label htmlFor="udhaar-due">Expected return date (optional)</Label><Input id="udhaar-due" type="date" min={givenDate} value={dueDate} onChange={(event) => setDueDate(event.target.value)} /><small>Leave blank if no return date was agreed.</small></div></div>
        </section>
        <section className="udhaar-entry-section" aria-labelledby="udhaar-notes-heading">
          <div className="udhaar-entry-section-title"><span>3</span><div><h3 id="udhaar-notes-heading">Anything else to remember?</h3><p>Add a short note if it will help identify this udhaar.</p></div></div>
          <div className="udhaar-entry-field"><Label htmlFor="udhaar-notes">Notes (optional)</Label><Input id="udhaar-notes" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="e.g. Given for shop supplies" /></div>
        </section>
        <div className="udhaar-entry-preview" aria-live="polite"><span>Amount to be recorded</span><strong>{rupees(amount) ? formatPKR(rupees(amount)!) : "Enter an amount"}</strong><small>{name.trim() ? `For ${name.trim()}` : "Add the person's name above"}</small></div>
        {error && <p role="alert" className="udhaar-entry-error">{error}</p>}
      </form>
      <DialogFooter className="udhaar-entry-footer"><Button type="button" variant="outline" onClick={onClose} disabled={saving}>Cancel</Button><Button type="submit" form="udhaar-form" disabled={saving}>{saving ? "Saving…" : "Save udhaar"}</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}

function RepaymentForm({ record, onClose, onSave }: { record: Udhaar; onClose: () => void; onSave: (value: AddUdhaarPaymentInput) => Promise<void> }) {
  const remaining = record.amount - record.paid_amount;
  const [amount, setAmount] = useState("");
  const [paidDate, setPaidDate] = useState(today());
  const [method, setMethod] = useState<"cash" | "bank" | "cheque" | "other">("cash");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError("");
    const result = AddUdhaarPaymentSchema.safeParse({ udhaar_id: record.id, amount: rupees(amount), paid_date: paidDate, method, notes });
    if (!result.success) { setError(result.error.issues[0]?.message ?? "Check the repayment."); return; }
    if (result.data.amount > remaining) { setError(`Payment cannot exceed ${formatPKR(remaining)} remaining.`); return; }
    setSaving(true);
    try { await onSave(result.data); onClose(); }
    catch (cause) { setError(`Could not save repayment: ${String(cause)}`); }
    finally { setSaving(false); }
  }
  return <Dialog open onOpenChange={(open) => { if (!open && !saving) onClose(); }}><DialogContent className="sm:max-w-lg"><DialogHeader><DialogTitle>Record repayment from {record.borrower_name}</DialogTitle></DialogHeader>
    <p className="text-sm text-muted-foreground">Still to receive: <strong>{formatPKR(remaining)}</strong></p>
    <form id="udhaar-payment-form" onSubmit={submit} className="space-y-4">
      <div><Label htmlFor="repayment-amount">Amount received (Rs) *</Label><Input id="repayment-amount" inputMode="numeric" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="e.g. 10,000" required /></div>
      <div className="grid gap-4 sm:grid-cols-2"><div><Label htmlFor="repayment-date">Date received *</Label><Input id="repayment-date" type="date" value={paidDate} onChange={(event) => setPaidDate(event.target.value)} required /></div><div><Label htmlFor="repayment-method">Payment method</Label><select id="repayment-method" className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={method} onChange={(event) => setMethod(event.target.value as typeof method)}><option value="cash">Cash</option><option value="bank">Bank</option><option value="cheque">Cheque</option><option value="other">Other</option></select></div></div>
      <div><Label htmlFor="repayment-notes">Notes (optional)</Label><Input id="repayment-notes" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Receipt or transfer reference" /></div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </form><DialogFooter><Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button><Button type="submit" form="udhaar-payment-form" disabled={saving}>{saving ? "Saving…" : "Save repayment"}</Button></DialogFooter>
  </DialogContent></Dialog>;
}
