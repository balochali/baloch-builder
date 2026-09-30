import { RingChart } from "@/components/charts/RingChart";
import { TimeSeriesChart, chartColors } from "@/components/charts/TimeSeriesChart";
import { useEffect, useState, type CSSProperties, type FormEvent } from "react";
import {
  differenceInCalendarDays,
  format,
  parseISO,
  startOfMonth,
  startOfWeek,
  startOfYear,
} from "date-fns";
import {
  ArrowRight,
  CarFront,
  ChartNoAxesColumn,
  House,
  List,
  MapPinned,
  MoreHorizontal,
  Plus,
  ShoppingBag,
  Trash2,
  TrendingUp,
  Watch,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useRecordFilters } from "@/components/RecordFilters";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatPKR, formatPKRInLakhCrore } from "@/domain/money";
import { formatDate } from "@/lib/dates";
import {
  archivePersonalExpense,
  createPersonalExpense,
  listPersonalExpenses,
  PersonalExpenseSchema,
  updatePersonalExpense,
  type ExpenseCategory,
  type PersonalExpense,
  type PersonalExpenseInput,
} from "@/data/repositories/personalExpenseRepository";

const categories = [
  { id: "car", label: "Cars", singular: "Car", icon: CarFront, color: "#2779b0" },
  { id: "watch", label: "Watches", singular: "Watch", icon: Watch, color: "#deaa35" },
  { id: "land", label: "Land", singular: "Land", icon: MapPinned, color: "#42a88c" },
  { id: "house", label: "Houses", singular: "House", icon: House, color: "#8b72ba" },
  { id: "other", label: "Other", singular: "Other", icon: MoreHorizontal, color: "#dc7974" },
] as const;

const categoryInfo = (category: ExpenseCategory) =>
  categories.find((item) => item.id === category) ?? categories[4];
const parseRupees = (value: string) => {
  if (!/^\d[\d,]*$/.test(value.trim())) return null;
  const amount = Number(value.replace(/,/g, "").trim());
  return Number.isSafeInteger(amount) && amount > 0 ? amount : null;
};
type ExpensePeriod = "all" | "daily" | "weekly" | "monthly" | "yearly" | "custom";
const periodLabels: Record<ExpensePeriod, string> = {
  all: "All time",
  daily: "Today",
  weekly: "This week",
  monthly: "This month",
  yearly: "This year",
  custom: "Custom",
};
function expenseRange(period: ExpensePeriod, from: string, to: string) {
  const now = new Date();
  return {
    start:
      period === "custom"
        ? from
        : period === "daily"
          ? format(now, "yyyy-MM-dd")
          : period === "weekly"
            ? format(startOfWeek(now, { weekStartsOn: 1 }), "yyyy-MM-dd")
            : period === "monthly"
              ? format(startOfMonth(now), "yyyy-MM-dd")
              : period === "yearly"
                ? format(startOfYear(now), "yyyy-MM-dd")
                : null,
    end: period === "custom" ? to : period === "all" ? null : format(now, "yyyy-MM-dd"),
  };
}

function ExpenseTrend({
  records,
  start,
  end,
}: {
  records: PersonalExpense[];
  start: string | null;
  end: string | null;
}) {
  if (!records.length) return null;
  const sortedDates = records.map((record) => record.purchase_date).sort();
  const span = differenceInCalendarDays(
    parseISO(end ?? sortedDates[sortedDates.length - 1]),
    parseISO(start ?? sortedDates[0]),
  );
  const groupingNote =
    span > 730
      ? "Yearly totals. "
      : span > 90
        ? "Monthly totals. "
        : span > 31
          ? "Weekly totals; dates mark the start of each week. "
          : "Daily totals. ";
  const bucket = (date: string) =>
    span > 730
      ? format(parseISO(date), "yyyy")
      : span > 90
        ? format(parseISO(date), "yyyy-MM")
        : span > 31
          ? format(startOfWeek(parseISO(date), { weekStartsOn: 1 }), "yyyy-MM-dd")
          : date;
  const grouped = new Map<string, number>();
  records.forEach((record) => {
    const key = bucket(record.purchase_date);
    grouped.set(key, (grouped.get(key) ?? 0) + record.amount);
  });
  const rows = [...grouped].sort(([a], [b]) => a.localeCompare(b));
  const points = rows.reduce<{ x: number; amount: number }[]>(
    (result, [, amount], index) => [
      ...result,
      {
        x: rows.length === 1 ? 150 : 12 + (index / (rows.length - 1)) * 276,
        amount: (result[result.length - 1]?.amount ?? 0) + amount,
      },
    ],
    [],
  );
  const max = points[points.length - 1].amount || 1;
  const display = (key: string) =>
    key.length === 4
      ? key
      : key.length === 7
        ? format(parseISO(`${key}-01`), "MMM yyyy")
        : formatDate(key);
  return (
    <section className="expense-trend" aria-label="Personal spending trend">
      <div className="expense-chart-title">
        <TrendingUp size={21} />
        <div>
          <h2>Spending over time</h2>
          <p>The line rises as purchases are added in this period.</p>
        </div>
      </div>
      <strong className="expense-trend-total">{formatPKRInLakhCrore(max)} spent</strong>
      <TimeSeriesChart
        points={rows.map(([key], index) => ({
          key,
          label: display(key),
          values: { spent: points[index].amount },
        }))}
        series={[{ key: "spent", label: "Cumulative spending", color: chartColors.purple }]}
        ariaLabel={"Spending rose to " + formatPKR(max)}
        caption={groupingNote + "Each point includes purchases through the end of that period."}
      />
    </section>
  );
}

export function PersonalExpensePage() {
  const [records, setRecords] = useState<PersonalExpense[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [view, setView] = useState<"overview" | "purchases">("overview");
  const [period, setPeriod] = useState<ExpensePeriod>("all");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  const [editing, setEditing] = useState<PersonalExpense | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [removing, setRemoving] = useState<PersonalExpense | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");

  useEffect(() => {
    let active = true;
    listPersonalExpenses()
      .then((rows) => {
        if (active) setRecords(rows);
      })
      .catch((cause) => {
        if (active) setLoadError(String(cause));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const validRange = period !== "custom" || (!!customFrom && !!customTo && customFrom <= customTo);
  const { start, end } = expenseRange(period, customFrom, customTo);
  const periodRecords = validRange
    ? records.filter(
        (record) =>
          (!start || record.purchase_date >= start) && (!end || record.purchase_date <= end),
      )
    : [];
  const total = periodRecords.reduce((sum, record) => sum + record.amount, 0);
  const byCategory = categories.map((category) => ({
    ...category,
    amount: periodRecords
      .filter((record) => record.category === category.id)
      .reduce((sum, record) => sum + record.amount, 0),
    count: periodRecords.filter((record) => record.category === category.id).length,
  }));
  const largest = Math.max(...byCategory.map((category) => category.amount), 1);
  const { visible, controls } = useRecordFilters(periodRecords, {
    label: "purchases",
    searchText: (record) => [record.item_name, record.notes].filter(Boolean).join(" "),
    amount: (record) => record.amount,
    date: (record) => record.purchase_date,
    dateLabel: "Purchased",
    facets: [{ label: "Category", value: (record) => categoryInfo(record.category).label }],
  });
  const donutSegments = byCategory.filter((category) => category.amount > 0);
  async function save(value: PersonalExpenseInput) {
    if (editing) await updatePersonalExpense(editing.id, value);
    else await createPersonalExpense(value);
    toast.success(editing ? "Purchase updated" : "Purchase saved");
    setFormOpen(false);
    setEditing(null);
    setView("purchases");
    try {
      setRecords(await listPersonalExpenses());
    } catch {
      toast.error("Saved. Reopen this page to see the latest purchases.");
    }
  }

  async function remove() {
    if (!removing) return;
    setBusy(true);
    setActionError("");
    try {
      await archivePersonalExpense(removing.id);
      setRecords((previous) => previous.filter((record) => record.id !== removing.id));
      setRemoving(null);
      toast.success("Purchase removed");
    } catch (cause) {
      setActionError(`Could not remove purchase: ${String(cause)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="expense-page">
      <header className="expense-heading">
        <div>
          <p className="projects-eyebrow">PERSONAL PURCHASES</p>
          <h1>Personal Expense</h1>
          <p>Keep a clear record of the cars, watches, property and other things you buy.</p>
        </div>
        <Button
          onClick={() => {
            setEditing(null);
            setFormOpen(true);
          }}
        >
          <Plus size={18} />
          Add purchase
        </Button>
      </header>
      <div className="expense-tabs" role="tablist" aria-label="Personal Expense views">
        {(["overview", "purchases"] as const).map((tab, index) => (
          <button
            type="button"
            role="tab"
            key={tab}
            id={`expense-tab-${tab}`}
            aria-selected={view === tab}
            aria-controls={`expense-panel-${tab}`}
            tabIndex={view === tab ? 0 : -1}
            onClick={() => setView(tab)}
            onKeyDown={(event) => {
              const next =
                event.key === "ArrowRight" || event.key === "ArrowLeft"
                  ? (index + 1) % 2
                  : event.key === "Home"
                    ? 0
                    : event.key === "End"
                      ? 1
                      : -1;
              if (next >= 0) {
                event.preventDefault();
                const target = next === 0 ? "overview" : "purchases";
                setView(target);
                document.getElementById(`expense-tab-${target}`)?.focus();
              }
            }}
          >
            {tab === "overview" ? <ChartNoAxesColumn size={17} /> : <List size={17} />}
            {tab === "overview" ? "Overview" : "Purchases"}
            {tab === "purchases" && records.length > 0 && <span>{records.length}</span>}
          </button>
        ))}
      </div>
      <div className="expense-period-panel">
        <div>
          <strong>Choose a time period</strong>
          <p>All totals, charts and purchases below use the dates you select.</p>
        </div>
        <div
          className="expense-period-options"
          role="group"
          aria-label="Personal expense time period"
        >
          {(Object.keys(periodLabels) as ExpensePeriod[]).map((option) => (
            <button
              type="button"
              key={option}
              aria-pressed={period === option}
              onClick={() => setPeriod(option)}
            >
              {periodLabels[option]}
            </button>
          ))}
        </div>
        {period === "custom" && (
          <div className="expense-custom-range">
            <div>
              <Label htmlFor="expense-from">From date</Label>
              <Input
                id="expense-from"
                type="date"
                value={customFrom}
                onChange={(event) => setCustomFrom(event.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="expense-to">To date</Label>
              <Input
                id="expense-to"
                type="date"
                min={customFrom || undefined}
                value={customTo}
                onChange={(event) => setCustomTo(event.target.value)}
              />
            </div>
          </div>
        )}
        {!validRange && (
          <p className="expense-period-error" role="status">
            Choose a start and end date, with the end on or after the start.
          </p>
        )}
        {validRange && (
          <span className="expense-period-caption">
            Showing:{" "}
            {period === "custom"
              ? `${formatDate(customFrom)} – ${formatDate(customTo)}`
              : periodLabels[period]}
          </span>
        )}
      </div>
      {loading ? (
        <p className="expense-message">Loading purchases…</p>
      ) : loadError ? (
        <p role="alert" className="expense-message text-destructive">
          Could not load purchases: {loadError}
        </p>
      ) : (
        <>
          {validRange && (
            <>
              {view === "overview" && (
                <section
                  id="expense-panel-overview"
                  role="tabpanel"
                  aria-labelledby="expense-tab-overview"
                  className="expense-tab-panel"
                >
                  <section className="expense-summary" aria-label="Purchase summary">
                    <div className="expense-total">
                      <span className="expense-summary-icon">
                        <ShoppingBag size={22} />
                      </span>
                      <span>{period === "all" ? "Total spent" : "Spent in this period"}</span>
                      <strong>{formatPKRInLakhCrore(total)}</strong>
                      <small>
                        {periodRecords.length}{" "}
                        {periodRecords.length === 1 ? "purchase" : "purchases"} in this period
                      </small>
                    </div>
                    <div className="expense-category-strip">
                      {byCategory
                        .filter((category) => category.count > 0)
                        .map((category) => {
                          const Icon = category.icon;
                          return (
                            <div
                              key={category.id}
                              style={{ "--expense-color": category.color } as CSSProperties}
                            >
                              <span className="expense-category-icon">
                                <Icon size={19} />
                              </span>
                              <span>{category.label}</span>
                              <strong>{formatPKRInLakhCrore(category.amount)}</strong>
                            </div>
                          );
                        })}
                    </div>
                  </section>
                  {periodRecords.length > 0 && (
                    <div className="expense-insight-grid">
                      <section className="expense-chart" aria-label="Spending by category">
                        <div>
                          <h2>Where your money went</h2>
                          <p>Each bar compares spending in a category during this period.</p>
                        </div>
                        <div className="expense-bars">
                          {byCategory
                            .filter((category) => category.count > 0)
                            .map((category) => (
                              <div className="expense-bar-row" key={category.id}>
                                <div>
                                  <strong>{category.label}</strong>
                                  <span>
                                    {category.count} {category.count === 1 ? "item" : "items"} ·{" "}
                                    {formatPKRInLakhCrore(category.amount)}
                                  </span>
                                </div>
                                <span className="expense-bar-track">
                                  <span
                                    style={{
                                      width: `${category.amount ? Math.max(3, (category.amount / largest) * 100) : 0}%`,
                                      background: category.color,
                                    }}
                                  />
                                </span>
                              </div>
                            ))}
                        </div>
                      </section>
                      <section className="expense-share" aria-label="Spending share by category">
                        <h2>Category share</h2>
                        <p>Which purchases took the largest share of spending?</p>
                        <div className="expense-share-layout">
                          <RingChart
                            value={periodRecords.length}
                            label="purchases"
                            ariaLabel={donutSegments
                              .map((category) => category.label + ": " + formatPKR(category.amount))
                              .join(", ")}
                            segments={donutSegments.map((category) => ({
                              label: category.label,
                              value: category.amount,
                              color: category.color,
                              display: formatPKR(category.amount),
                            }))}
                          />
                          <div className="expense-share-legend">
                            {donutSegments.map((category) => (
                              <div key={category.id}>
                                <i style={{ background: category.color }} />
                                <span>{category.label}</span>
                                <strong>{Math.round((category.amount / total) * 100)}%</strong>
                              </div>
                            ))}
                          </div>
                        </div>
                      </section>
                    </div>
                  )}
                  {periodRecords.length > 0 && (
                    <ExpenseTrend records={periodRecords} start={start} end={end} />
                  )}
                  {records.length === 0 ? (
                    <div className="expense-empty expense-overview-empty">
                      <ShoppingBag size={32} />
                      <h3>Your overview starts here</h3>
                      <p>Add your first purchase to see totals and a breakdown by category.</p>
                      <Button
                        onClick={() => {
                          setEditing(null);
                          setFormOpen(true);
                        }}
                      >
                        <Plus size={17} />
                        Add purchase
                      </Button>
                    </div>
                  ) : periodRecords.length === 0 ? (
                    <div className="expense-empty expense-overview-empty">
                      <ChartNoAxesColumn size={32} />
                      <h3>No purchases in this period</h3>
                      <p>Choose another time period to see your spending.</p>
                      <Button variant="outline" onClick={() => setPeriod("all")}>
                        Show all time
                      </Button>
                    </div>
                  ) : (
                    <Button
                      variant="outline"
                      className="expense-view-purchases"
                      onClick={() => setView("purchases")}
                    >
                      See purchases in this period <ArrowRight size={17} />
                    </Button>
                  )}
                </section>
              )}
              {view === "purchases" && (
                <section
                  id="expense-panel-purchases"
                  role="tabpanel"
                  aria-labelledby="expense-tab-purchases"
                  className="expense-tab-panel"
                >
                  <section className="expense-records" aria-labelledby="expense-records-title">
                    <div className="expense-records-heading">
                      <div>
                        <h2 id="expense-records-title">Your purchases</h2>
                        <p>Select a purchase to change its details.</p>
                      </div>
                      <span>{visible.length} shown</span>
                    </div>
                    {controls}
                    {records.length === 0 ? (
                      <div className="expense-empty">
                        <ShoppingBag size={32} />
                        <h3>No purchases recorded yet</h3>
                        <p>Start with a car, watch, land, house or any other personal purchase.</p>
                        <Button
                          onClick={() => {
                            setEditing(null);
                            setFormOpen(true);
                          }}
                        >
                          <Plus size={17} />
                          Add your first purchase
                        </Button>
                      </div>
                    ) : visible.length === 0 ? (
                      <p className="expense-empty">
                        No purchases match the selected dates, search or category.
                      </p>
                    ) : (
                      <div className="expense-list">
                        {visible.map((record) => {
                          const category = categoryInfo(record.category);
                          const Icon = category.icon;
                          return (
                            <div
                              className="expense-item"
                              key={record.id}
                              style={{ "--expense-color": category.color } as CSSProperties}
                            >
                              <span className="expense-item-icon">
                                <Icon size={23} />
                              </span>
                              <div className="expense-item-info">
                                <strong>{record.item_name}</strong>
                                <span>
                                  {category.singular} · Bought {formatDate(record.purchase_date)}
                                </span>
                                {record.notes && <p>{record.notes}</p>}
                              </div>
                              <strong className="expense-item-amount">
                                {formatPKRInLakhCrore(record.amount)}
                              </strong>
                              <div className="expense-item-actions">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => {
                                    setEditing(record);
                                    setFormOpen(true);
                                  }}
                                >
                                  Edit
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  aria-label={`Remove ${record.item_name}`}
                                  onClick={() => {
                                    setActionError("");
                                    setRemoving(record);
                                  }}
                                >
                                  <Trash2 size={17} />
                                </Button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </section>
                </section>
              )}
            </>
          )}
        </>
      )}
      {formOpen && (
        <ExpenseForm
          key={editing?.id ?? "new"}
          record={editing}
          onClose={() => {
            setFormOpen(false);
            setEditing(null);
          }}
          onSave={save}
        />
      )}
      <Dialog
        open={Boolean(removing)}
        onOpenChange={(open) => {
          if (!open && !busy) setRemoving(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove this purchase?</DialogTitle>
            <p className="text-sm text-muted-foreground">
              {removing?.item_name} will be removed from your spending totals and list.
            </p>
          </DialogHeader>
          {actionError && (
            <p role="alert" className="text-sm text-destructive">
              {actionError}
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemoving(null)} disabled={busy}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={remove} disabled={busy}>
              {busy ? "Removing…" : "Remove purchase"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}

function ExpenseForm({
  record,
  onClose,
  onSave,
}: {
  record: PersonalExpense | null;
  onClose: () => void;
  onSave: (value: PersonalExpenseInput) => Promise<void>;
}) {
  const [category, setCategory] = useState<ExpenseCategory>(record?.category ?? "car");
  const [name, setName] = useState(record?.item_name ?? "");
  const [amount, setAmount] = useState(record ? String(record.amount) : "");
  const [purchaseDate, setPurchaseDate] = useState(
    record?.purchase_date ?? format(new Date(), "yyyy-MM-dd"),
  );
  const [notes, setNotes] = useState(record?.notes ?? "");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const result = PersonalExpenseSchema.safeParse({
      category,
      item_name: name,
      amount: parseRupees(amount),
      purchase_date: purchaseDate,
      notes,
    });
    if (!result.success) {
      setError(result.error.issues[0]?.message ?? "Check the purchase details.");
      return;
    }
    setSaving(true);
    try {
      await onSave(result.data);
    } catch (cause) {
      setError(`Could not save purchase: ${String(cause)}`);
    } finally {
      setSaving(false);
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !saving) onClose();
      }}
    >
      <DialogContent className="expense-dialog max-h-[92vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{record ? "Edit purchase" : "Add a personal purchase"}</DialogTitle>
          <p className="text-sm text-muted-foreground">
            Choose a type, then write what you bought and how much you paid.
          </p>
        </DialogHeader>
        <form id="expense-form" onSubmit={submit} className="expense-form">
          <div>
            <Label htmlFor="expense-category">What did you buy? *</Label>
            <select
              id="expense-category"
              value={category}
              onChange={(event) => {
                setCategory(event.target.value as ExpenseCategory);
                setName("");
              }}
              className="expense-select"
            >
              <option value="car">Car</option>
              <option value="watch">Watch</option>
              <option value="land">Land</option>
              <option value="house">House</option>
              <option value="other">Other item</option>
            </select>
          </div>
          <div>
            <Label htmlFor="expense-name">
              {category === "other"
                ? "Write your own item *"
                : `${categoryInfo(category).singular} name or details *`}
            </Label>
            <Input
              id="expense-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={
                category === "other"
                  ? "e.g. Furniture, phone or jewellery"
                  : category === "car"
                    ? "e.g. Toyota Corolla"
                    : category === "watch"
                      ? "e.g. Seiko watch"
                      : category === "land"
                        ? "e.g. Plot in Gulshan"
                        : "e.g. Family house"
              }
              required
            />
          </div>
          <div className="expense-form-grid">
            <div>
              <Label htmlFor="expense-amount">Amount paid (Rs) *</Label>
              <Input
                id="expense-amount"
                inputMode="numeric"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                placeholder="e.g. 500,000"
                required
              />
            </div>
            <div>
              <Label htmlFor="expense-date">Purchase date *</Label>
              <Input
                id="expense-date"
                type="date"
                value={purchaseDate}
                onChange={(event) => setPurchaseDate(event.target.value)}
                required
              />
            </div>
          </div>
          <div>
            <Label htmlFor="expense-notes">Notes (optional)</Label>
            <Input
              id="expense-notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="e.g. Location, model or payment details"
            />
          </div>
          <div className="expense-form-preview">
            <span>Purchase to record</span>
            <strong>
              {parseRupees(amount) ? formatPKR(parseRupees(amount)!) : "Enter an amount"}
            </strong>
            <small>{name.trim() || "Write what you bought above"}</small>
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" form="expense-form" disabled={saving}>
            {saving ? "Saving…" : record ? "Save changes" : "Save purchase"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
