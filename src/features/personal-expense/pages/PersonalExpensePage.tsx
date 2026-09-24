import { useEffect, useMemo, useState, type CSSProperties, type FormEvent } from "react";
import { format } from "date-fns";
import { CarFront, House, MapPinned, MoreHorizontal, Plus, Search, ShoppingBag, Trash2, Watch } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatPKR, formatPKRInLakhCrore } from "@/domain/money";
import { formatDate } from "@/lib/dates";
import { archivePersonalExpense, createPersonalExpense, listPersonalExpenses, PersonalExpenseSchema,
  updatePersonalExpense, type ExpenseCategory, type PersonalExpense, type PersonalExpenseInput } from "@/data/repositories/personalExpenseRepository";

const categories = [
  { id: "car", label: "Cars", singular: "Car", icon: CarFront, color: "#2779b0" },
  { id: "watch", label: "Watches", singular: "Watch", icon: Watch, color: "#deaa35" },
  { id: "land", label: "Land", singular: "Land", icon: MapPinned, color: "#42a88c" },
  { id: "house", label: "Houses", singular: "House", icon: House, color: "#8b72ba" },
  { id: "other", label: "Other", singular: "Other", icon: MoreHorizontal, color: "#dc7974" },
] as const;

const categoryInfo = (category: ExpenseCategory) => categories.find((item) => item.id === category) ?? categories[4];
const parseRupees = (value: string) => {
  if (!/^\d[\d,]*$/.test(value.trim())) return null;
  const amount = Number(value.replace(/,/g, "").trim());
  return Number.isSafeInteger(amount) && amount > 0 ? amount : null;
};

export function PersonalExpensePage() {
  const [records, setRecords] = useState<PersonalExpense[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<ExpenseCategory | "all">("all");
  const [editing, setEditing] = useState<PersonalExpense | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [removing, setRemoving] = useState<PersonalExpense | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");

  useEffect(() => {
    let active = true;
    listPersonalExpenses().then((rows) => { if (active) setRecords(rows); })
      .catch((cause) => { if (active) setLoadError(String(cause)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const total = records.reduce((sum, record) => sum + record.amount, 0);
  const byCategory = categories.map((category) => ({ ...category,
    amount: records.filter((record) => record.category === category.id).reduce((sum, record) => sum + record.amount, 0),
    count: records.filter((record) => record.category === category.id).length,
  }));
  const largest = Math.max(...byCategory.map((category) => category.amount), 1);
  const visible = useMemo(() => records.filter((record) =>
    (filter === "all" || record.category === filter) &&
    `${record.item_name} ${record.notes}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())), [records, filter, search]);

  async function save(value: PersonalExpenseInput) {
    if (editing) await updatePersonalExpense(editing.id, value);
    else await createPersonalExpense(value);
    toast.success(editing ? "Purchase updated" : "Purchase saved");
    setFormOpen(false);
    setEditing(null);
    try { setRecords(await listPersonalExpenses()); }
    catch { toast.error("Saved. Reopen this page to see the latest purchases."); }
  }

  async function remove() {
    if (!removing) return;
    setBusy(true); setActionError("");
    try {
      await archivePersonalExpense(removing.id);
      setRecords((previous) => previous.filter((record) => record.id !== removing.id));
      setRemoving(null);
      toast.success("Purchase removed");
    } catch (cause) { setActionError(`Could not remove purchase: ${String(cause)}`); }
    finally { setBusy(false); }
  }

  return <main className="expense-page">
    <header className="expense-heading"><div><p className="projects-eyebrow">PERSONAL PURCHASES</p><h1>Personal Expense</h1><p>Keep a clear record of the cars, watches, property and other things you buy.</p></div>
      <Button onClick={() => { setEditing(null); setFormOpen(true); }}><Plus size={18} />Add purchase</Button></header>
    {loading ? <p className="expense-message">Loading purchases…</p> : loadError ? <p role="alert" className="expense-message text-destructive">Could not load purchases: {loadError}</p> : <>
      <section className="expense-summary" aria-label="Purchase summary">
        <div className="expense-total"><span className="expense-summary-icon"><ShoppingBag size={22} /></span><span>Total spent</span><strong>{formatPKRInLakhCrore(total)}</strong><small>{records.length} {records.length === 1 ? "purchase" : "purchases"} recorded</small></div>
        <div className="expense-category-strip">{byCategory.map((category) => {
          const Icon = category.icon;
          return <div key={category.id} style={{ "--expense-color": category.color } as CSSProperties}><span className="expense-category-icon"><Icon size={19} /></span><span>{category.label}</span><strong>{formatPKRInLakhCrore(category.amount)}</strong></div>;
        })}</div>
      </section>
      {records.length > 0 && <section className="expense-chart" aria-label="Spending by category"><div><h2>Where your money went</h2><p>Each bar compares your total spending in that category.</p></div>
        <div className="expense-bars">{byCategory.map((category) => <div className="expense-bar-row" key={category.id}>
          <div><strong>{category.label}</strong><span>{category.count} {category.count === 1 ? "item" : "items"} · {formatPKRInLakhCrore(category.amount)}</span></div>
          <span className="expense-bar-track"><span style={{ width: `${category.amount ? Math.max(3, category.amount / largest * 100) : 0}%`, background: category.color }} /></span>
        </div>)}</div></section>}
      <section className="expense-records" aria-labelledby="expense-records-title"><div className="expense-records-heading"><div><h2 id="expense-records-title">Your purchases</h2><p>Select a purchase to change its details.</p></div><span>{visible.length} shown</span></div>
        {records.length > 0 && <div className="expense-tools"><div className="expense-search"><Search size={17} /><Input aria-label="Search purchases" placeholder="Search by item or note…" value={search} onChange={(event) => setSearch(event.target.value)} /></div>
          <div className="expense-filters" aria-label="Filter purchases">{[{ id: "all", label: "All" }, ...categories].map((category) => <button type="button" key={category.id} className={filter === category.id ? "is-active" : ""} aria-pressed={filter === category.id} onClick={() => setFilter(category.id as ExpenseCategory | "all")}>{category.label}</button>)}</div></div>}
        {records.length === 0 ? <div className="expense-empty"><ShoppingBag size={32} /><h3>No purchases recorded yet</h3><p>Start with a car, watch, land, house or any other personal purchase.</p><Button onClick={() => { setEditing(null); setFormOpen(true); }}><Plus size={17} />Add your first purchase</Button></div> : visible.length === 0 ? <p className="expense-empty">No purchases match this search or category.</p> :
          <div className="expense-list">{visible.map((record) => { const category = categoryInfo(record.category); const Icon = category.icon;
            return <div className="expense-item" key={record.id} style={{ "--expense-color": category.color } as CSSProperties}>
              <span className="expense-item-icon"><Icon size={23} /></span><div className="expense-item-info"><strong>{record.item_name}</strong><span>{category.singular} · Bought {formatDate(record.purchase_date)}</span>{record.notes && <p>{record.notes}</p>}</div>
              <strong className="expense-item-amount">{formatPKRInLakhCrore(record.amount)}</strong><div className="expense-item-actions"><Button variant="outline" size="sm" onClick={() => { setEditing(record); setFormOpen(true); }}>Edit</Button><Button variant="ghost" size="icon" aria-label={`Remove ${record.item_name}`} onClick={() => { setActionError(""); setRemoving(record); }}><Trash2 size={17} /></Button></div>
            </div>;
          })}</div>}
      </section>
    </>}
    {formOpen && <ExpenseForm key={editing?.id ?? "new"} record={editing} onClose={() => { setFormOpen(false); setEditing(null); }} onSave={save} />}
    <Dialog open={Boolean(removing)} onOpenChange={(open) => { if (!open && !busy) setRemoving(null); }}><DialogContent><DialogHeader><DialogTitle>Remove this purchase?</DialogTitle><p className="text-sm text-muted-foreground">{removing?.item_name} will be removed from your spending totals and list.</p></DialogHeader>{actionError && <p role="alert" className="text-sm text-destructive">{actionError}</p>}<DialogFooter><Button variant="outline" onClick={() => setRemoving(null)} disabled={busy}>Cancel</Button><Button variant="destructive" onClick={remove} disabled={busy}>{busy ? "Removing…" : "Remove purchase"}</Button></DialogFooter></DialogContent></Dialog>
  </main>;
}

function ExpenseForm({ record, onClose, onSave }: { record: PersonalExpense | null; onClose: () => void; onSave: (value: PersonalExpenseInput) => Promise<void> }) {
  const [category, setCategory] = useState<ExpenseCategory>(record?.category ?? "car");
  const [name, setName] = useState(record?.item_name ?? "");
  const [amount, setAmount] = useState(record ? String(record.amount) : "");
  const [purchaseDate, setPurchaseDate] = useState(record?.purchase_date ?? format(new Date(), "yyyy-MM-dd"));
  const [notes, setNotes] = useState(record?.notes ?? "");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError("");
    const result = PersonalExpenseSchema.safeParse({ category, item_name: name, amount: parseRupees(amount), purchase_date: purchaseDate, notes });
    if (!result.success) { setError(result.error.issues[0]?.message ?? "Check the purchase details."); return; }
    setSaving(true);
    try { await onSave(result.data); }
    catch (cause) { setError(`Could not save purchase: ${String(cause)}`); }
    finally { setSaving(false); }
  }
  return <Dialog open onOpenChange={(open) => { if (!open && !saving) onClose(); }}><DialogContent className="expense-dialog max-h-[92vh] overflow-y-auto sm:max-w-xl"><DialogHeader><DialogTitle>{record ? "Edit purchase" : "Add a personal purchase"}</DialogTitle><p className="text-sm text-muted-foreground">Choose a type, then write what you bought and how much you paid.</p></DialogHeader>
    <form id="expense-form" onSubmit={submit} className="expense-form"><div><Label htmlFor="expense-category">What did you buy? *</Label><select id="expense-category" value={category} onChange={(event) => { setCategory(event.target.value as ExpenseCategory); setName(""); }} className="expense-select"><option value="car">Car</option><option value="watch">Watch</option><option value="land">Land</option><option value="house">House</option><option value="other">Other item</option></select></div>
      <div><Label htmlFor="expense-name">{category === "other" ? "Write your own item *" : `${categoryInfo(category).singular} name or details *`}</Label><Input id="expense-name" value={name} onChange={(event) => setName(event.target.value)} placeholder={category === "other" ? "e.g. Furniture, phone or jewellery" : category === "car" ? "e.g. Toyota Corolla" : category === "watch" ? "e.g. Seiko watch" : category === "land" ? "e.g. Plot in Gulshan" : "e.g. Family house"} required /></div>
      <div className="expense-form-grid"><div><Label htmlFor="expense-amount">Amount paid (Rs) *</Label><Input id="expense-amount" inputMode="numeric" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="e.g. 500,000" required /></div><div><Label htmlFor="expense-date">Purchase date *</Label><Input id="expense-date" type="date" value={purchaseDate} onChange={(event) => setPurchaseDate(event.target.value)} required /></div></div>
      <div><Label htmlFor="expense-notes">Notes (optional)</Label><Input id="expense-notes" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="e.g. Location, model or payment details" /></div>
      <div className="expense-form-preview"><span>Purchase to record</span><strong>{parseRupees(amount) ? formatPKR(parseRupees(amount)!) : "Enter an amount"}</strong><small>{name.trim() || "Write what you bought above"}</small></div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </form><DialogFooter><Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button><Button type="submit" form="expense-form" disabled={saving}>{saving ? "Saving…" : record ? "Save changes" : "Save purchase"}</Button></DialogFooter>
  </DialogContent></Dialog>;
}
