import "./personal-expense.css";
import { accountName } from "@/domain/bankAccount";
import { UdhaarPaymentDetails } from "@/components/UdhaarPaymentDetails";
import { emptyPaymentDetails, paymentSummary } from "@/domain/udhaarPaymentDetails";
import { BankAccountSelect } from "@/components/BankAccountSelect";
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
  Wallet,
  ReceiptText,
  PieChart,
  ArrowRight,
  CalendarDays,
  SlidersHorizontal,
  ChevronDown,
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
  { id: "car", label: "Cars", singular: "Car", icon: CarFront, color: "#2563eb" },
  { id: "watch", label: "Watches", singular: "Watch", icon: Watch, color: "#d97706" },
  { id: "land", label: "Land", singular: "Land", icon: MapPinned, color: "#059669" },
  { id: "house", label: "Houses", singular: "House", icon: House, color: "#7c3aed" },
  { id: "other", label: "Other", singular: "Other", icon: MoreHorizontal, color: "#e11d48" },
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
  const cumulative = rows.reduce<{ key: string; values: { spent: number } }[]>(
    (result, [key, amount]) => [
      ...result,
      { key, values: { spent: (result[result.length - 1]?.values.spent ?? 0) + amount } },
    ],
    [],
  );
  const total = cumulative[cumulative.length - 1].values.spent;
  const peak = rows.reduce((highest, row) => (row[1] > highest[1] ? row : highest), rows[0]);
  const unit = span > 730 ? "year" : span > 90 ? "month" : span > 31 ? "week" : "day";
  const display = (key: string) =>
    key.length === 4
      ? key
      : key.length === 7
        ? format(parseISO(key + "-01"), "MMM yyyy")
        : formatDate(key);
  const shortDate = (point: { key: string }) =>
    point.key.length === 4
      ? point.key
      : point.key.length === 7
        ? format(parseISO(point.key + "-01"), "MMM yy")
        : format(parseISO(point.key), "d MMM");
  return (
    <div className="expense-trends-row">
      <section
        className="expense-trend expense-spending-card"
        style={{ "--trend-color": "#7c3aed" } as CSSProperties}
        aria-label="Personal spending trend"
      >
        <header className="expense-spending-header">
          <span className="expense-spending-icon">
            <TrendingUp size={25} aria-hidden="true" />
          </span>
          <div>
            <h2>Total spending</h2>
            <p>How your purchases add up over time</p>
          </div>
          <span className="expense-spending-tag">Running total</span>
        </header>
        <div className="expense-spending-metric">
          <strong>{formatPKRInLakhCrore(total)}</strong>
          <span>
            {formatPKR(total)} across {records.length}{" "}
            {records.length === 1 ? "purchase" : "purchases"}
          </span>
        </div>
        <TimeSeriesChart
          fillWidth
          axisLabel={shortDate}
          points={cumulative.map((point) => ({ ...point, label: display(point.key) }))}
          series={[{ key: "spent", label: "Running total", color: chartColors.purple }]}
          ariaLabel={"Spending rose to " + formatPKR(total)}
          caption={groupingNote + "Includes earlier purchases in your selected range."}
        />
      </section>
      <section
        className="expense-trend expense-spending-card"
        style={{ "--trend-color": "#e11d48" } as CSSProperties}
        aria-label="Spending in individual periods"
      >
        <header className="expense-spending-header">
          <span className="expense-spending-icon">
            <ChartNoAxesColumn size={25} aria-hidden="true" />
          </span>
          <div>
            <h2>Spending by {unit}</h2>
            <p>Compare what you spent each {unit}</p>
          </div>
          <span className="expense-spending-tag">
            {unit === "day"
              ? "Daily"
              : unit === "week"
                ? "Weekly"
                : unit === "month"
                  ? "Monthly"
                  : "Yearly"}
          </span>
        </header>
        <div className="expense-spending-metric">
          <strong>{formatPKRInLakhCrore(peak[1])}</strong>
          <span>
            Highest {unit} · {unit === "week" ? "Week of " : ""}
            {display(peak[0])}
          </span>
        </div>
        <TimeSeriesChart
          fillWidth
          axisLabel={shortDate}
          defaultMode="bar"
          points={rows.map(([key, amount]) => ({
            key,
            label: display(key),
            values: { spent: amount },
          }))}
          series={[{ key: "spent", label: "Period spending", color: chartColors.coral }]}
          ariaLabel="Spending per period"
          caption={groupingNote + "Each period is separate; earlier purchases are not added."}
        />
      </section>
    </div>
  );
}

export function PersonalExpensePage() {
  const [records, setRecords] = useState<PersonalExpense[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [view, setView] = useState<"overview" | "purchases" | "payments">("overview");
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
  const {
    visible,
    controls,
    active: filtersActive,
    reset: resetFilters,
  } = useRecordFilters(periodRecords, {
    label: "purchases",
    searchText: (record) =>
      [record.item_name, record.notes, paymentSummary(JSON.stringify(record.payment_details ?? {}))]
        .filter(Boolean)
        .join(" "),
    amount: (record) => record.amount,
    date: (record) => record.purchase_date,
    dateLabel: "Purchased",
    facets: [
      { label: "Category", value: (record) => categoryInfo(record.category).label },
      { label: "Account", value: (record) => accountName(record.account_key) },
      {
        label: "Payment method",
        value: (record) => record.payment_details?.method ?? "Not recorded",
      },
    ],
  });
  const total = visible.reduce((sum, record) => sum + record.amount, 0);
  const byCategory = categories.map((category) => ({
    ...category,
    amount: visible
      .filter((record) => record.category === category.id)
      .reduce((sum, record) => sum + record.amount, 0),
    count: visible.filter((record) => record.category === category.id).length,
  }));
  const largest = Math.max(...byCategory.map((category) => category.amount), 1);
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
        <div className="expense-heading-content">
          <p className="projects-eyebrow">
            <Wallet size={16} aria-hidden="true" /> PERSONAL PURCHASES
          </p>
          <h1>Personal Expense</h1>
          <p>Cars, watches, property & more. See what you bought and where your money went.</p>
        </div>
        <Button
          className="expense-add-btn"
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
        {(["overview", "purchases", "payments"] as const).map((tab, index) => (
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
                  ? (index + (event.key === "ArrowRight" ? 1 : 2)) % 3
                  : event.key === "Home"
                    ? 0
                    : event.key === "End"
                      ? 2
                      : -1;
              if (next >= 0) {
                event.preventDefault();
                const target = (["overview", "purchases", "payments"] as const)[next];
                setView(target);
                document.getElementById(`expense-tab-${target}`)?.focus();
              }
            }}
          >
            {tab === "overview" ? (
              <ChartNoAxesColumn size={17} />
            ) : tab === "payments" ? (
              <Wallet size={17} />
            ) : (
              <List size={17} />
            )}
            <span>
              {tab === "overview" ? "Overview" : tab === "payments" ? "Payments" : "Purchases"}
            </span>
            {tab === "purchases" && records.length > 0 && (
              <span className="expense-tab-count">{records.length}</span>
            )}
          </button>
        ))}
      </div>

      <div className="expense-period-panel">
        <div className="expense-period-head">
          <div className="expense-period-icon">
            <CalendarDays size={18} />
          </div>
          <div>
            <strong>Reporting period</strong>
            <p>One date range for every view.</p>
          </div>
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
          <details className="expense-filter-drawer">
            <summary>
              <span>
                <SlidersHorizontal size={18} /> Search & filter purchases
              </span>
              <span className="expense-filter-status">
                {filtersActive ? "Filters applied" : "All purchases"}
                <ChevronDown size={16} />
              </span>
            </summary>
            {controls}
          </details>
          {filtersActive && (
            <div className="expense-active-filter-note">
              <span>
                Showing {visible.length} matching purchases. Totals and charts use these filters.
              </span>
              <Button variant="ghost" size="sm" onClick={resetFilters}>
                Clear filters
              </Button>
            </div>
          )}
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
                      <div className="expense-total-top">
                        <span className="expense-summary-icon">
                          <ShoppingBag size={22} />
                        </span>
                        <span className="expense-total-badge">{periodLabels[period]}</span>
                      </div>
                      <span className="expense-total-label">
                        {period === "all" ? "Total spent" : "Spent in this period"}
                      </span>
                      <strong className="expense-total-amount">
                        {formatPKRInLakhCrore(total)}
                      </strong>
                      <span className="expense-total-exact">{formatPKR(total)}</span>
                      <small className="expense-total-count">
                        {visible.length} {visible.length === 1 ? "purchase" : "purchases"} in this
                        period
                      </small>
                    </div>
                    <div className="expense-kpis">
                      <article className="expense-kpi-card">
                        <div className="expense-kpi-icon expense-kpi-avg">
                          <ReceiptText size={20} aria-hidden="true" />
                        </div>
                        <div className="expense-kpi-content">
                          <span>Average purchase</span>
                          <strong>
                            {formatPKR(visible.length ? Math.round(total / visible.length) : 0)}
                          </strong>
                        </div>
                      </article>
                      <article className="expense-kpi-card">
                        <div className="expense-kpi-icon expense-kpi-max">
                          <TrendingUp size={20} aria-hidden="true" />
                        </div>
                        <div className="expense-kpi-content">
                          <span>Largest purchase</span>
                          <strong>
                            {formatPKR(
                              visible.length ? Math.max(...visible.map((r) => r.amount)) : 0,
                            )}
                          </strong>
                        </div>
                      </article>
                      <article className="expense-kpi-card">
                        <div className="expense-kpi-icon expense-kpi-wallet">
                          <Wallet size={20} aria-hidden="true" />
                        </div>
                        <div className="expense-kpi-content">
                          <span>Personal account spending</span>
                          <strong>
                            {formatPKR(
                              visible
                                .filter((r) => r.account_key === "personal")
                                .reduce((sum, r) => sum + r.amount, 0),
                            )}
                          </strong>
                        </div>
                      </article>
                    </div>
                  </section>
                  <section className="expense-category-cards" aria-label="Purchase categories">
                    {byCategory.map((category) => {
                      const Icon = category.icon;
                      return (
                        <article
                          className="expense-category-card"
                          key={category.id}
                          style={{ "--expense-color": category.color } as CSSProperties}
                        >
                          <span className="expense-category-card-icon">
                            <Icon size={29} strokeWidth={1.8} aria-hidden="true" />
                          </span>
                          <h2>{category.label}</h2>
                          <strong>{formatPKRInLakhCrore(category.amount)}</strong>
                          <span>
                            {category.count} {category.count === 1 ? "purchase" : "purchases"}
                          </span>
                        </article>
                      );
                    })}
                  </section>
                  {visible.length > 0 && (
                    <div className="expense-insight-grid">
                      <section className="expense-chart" aria-label="Spending by category">
                        <div className="expense-section-head">
                          <h2>
                            <ChartNoAxesColumn size={19} aria-hidden="true" /> Where your money went
                          </h2>
                          <p>Each bar compares spending in a category during this period.</p>
                        </div>
                        <div className="expense-bars">
                          {byCategory
                            .filter((category) => category.count > 0)
                            .map((category) => (
                              <div className="expense-bar-row" key={category.id}>
                                <div className="expense-bar-info">
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
                        <div className="expense-section-head">
                          <h2>
                            <PieChart size={19} aria-hidden="true" /> Category share
                          </h2>
                          <p>Which purchases took the largest share of spending?</p>
                        </div>
                        <div className="expense-share-layout">
                          <RingChart
                            value={visible.length}
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
                              <div key={category.id} className="expense-share-legend-item">
                                <i style={{ background: category.color }} />
                                <span className="expense-legend-label">{category.label}</span>
                                <strong>{Math.round((category.amount / total) * 100)}%</strong>
                              </div>
                            ))}
                          </div>
                        </div>
                      </section>
                    </div>
                  )}
                  {visible.length > 0 && (
                    <>
                      <section className="expense-recent" aria-labelledby="expense-recent-title">
                        <div className="expense-records-heading">
                          <div>
                            <h2 id="expense-recent-title">Recent purchases</h2>
                            <p>Your latest purchases in the selected results.</p>
                          </div>
                          <Button variant="ghost" onClick={() => setView("purchases")}>
                            View all <ArrowRight size={16} />
                          </Button>
                        </div>
                        {[...visible]
                          .sort((a, b) => b.purchase_date.localeCompare(a.purchase_date))
                          .slice(0, 4)
                          .map((record) => {
                            const category = categoryInfo(record.category);
                            const Icon = category.icon;
                            return (
                              <button
                                className="expense-recent-row"
                                key={record.id}
                                onClick={() => {
                                  setEditing(record);
                                  setFormOpen(true);
                                }}
                                aria-label={"Edit " + record.item_name}
                              >
                                <span
                                  className="expense-recent-icon"
                                  style={{ "--expense-color": category.color } as CSSProperties}
                                >
                                  <Icon size={20} />
                                </span>
                                <span className="expense-recent-name">
                                  <strong>{record.item_name}</strong>
                                  <small>
                                    {category.singular} · {formatDate(record.purchase_date)}
                                  </small>
                                </span>
                                <strong>{formatPKR(record.amount)}</strong>
                                <ArrowRight size={16} aria-hidden="true" />
                              </button>
                            );
                          })}
                      </section>
                      <div className="expense-trend-details">
                        <ExpenseTrend records={visible} start={start} end={end} />
                      </div>
                    </>
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
                  ) : visible.length === 0 ? (
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
              {view === "payments" && (
                <section
                  id="expense-panel-payments"
                  role="tabpanel"
                  aria-labelledby="expense-tab-payments"
                  className="expense-tab-panel"
                >
                  <div className="expense-account-grid">
                    {(["personal", "builder", undefined] as const).map((account) => {
                      const rows = visible.filter((r) => (r.account_key ?? undefined) === account);
                      const totalSpent = rows.reduce((sum, r) => sum + r.amount, 0);
                      return (
                        <article key={account ?? "unassigned"} className="expense-account-card">
                          <div className="expense-account-icon">
                            <Wallet aria-hidden="true" />
                          </div>
                          <div className="expense-account-info">
                            <h2>{accountName(account)}</h2>
                            <strong>{formatPKR(totalSpent)}</strong>
                            <p>
                              {rows.length} {rows.length === 1 ? "purchase" : "purchases"} ·
                              selected filters
                            </p>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                  <section className="expense-records">
                    <div className="expense-records-heading">
                      <div>
                        <h2>
                          <ReceiptText size={19} aria-hidden="true" /> Payment history
                        </h2>
                        <p>
                          Receiver, payment service and receipt details saved with each purchase.
                        </p>
                      </div>
                      <span className="expense-records-count">{visible.length} shown</span>
                    </div>
                    <div className="expense-payment-list">
                      {visible.length ? (
                        visible.map((record) => (
                          <article key={record.id} className="expense-payment-card">
                            <div className="expense-payment-meta">
                              <strong>{record.item_name}</strong>
                              <small>
                                {formatDate(record.purchase_date)} ·{" "}
                                {accountName(record.account_key)}
                              </small>
                              <p>
                                {record.payment_details
                                  ? paymentSummary(JSON.stringify(record.payment_details))
                                  : "Payment details not recorded. Edit this purchase to add them."}
                              </p>
                            </div>
                            <div className="expense-payment-amount-wrap">
                              <strong>{formatPKR(record.amount)}</strong>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  setEditing(record);
                                  setFormOpen(true);
                                }}
                              >
                                Edit details
                              </Button>
                            </div>
                          </article>
                        ))
                      ) : (
                        <p className="expense-empty">No payments match these filters.</p>
                      )}
                    </div>
                  </section>
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
                        <p>Review what you bought, how you paid, and edit any details.</p>
                      </div>
                      <span className="expense-records-count">{visible.length} shown</span>
                    </div>

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
                                <Icon size={22} />
                              </span>
                              <div className="expense-item-info">
                                <div className="expense-item-title-row">
                                  <strong>{record.item_name}</strong>
                                  <span
                                    className="expense-category-tag"
                                    style={{ color: category.color, borderColor: category.color }}
                                  >
                                    {category.singular}
                                  </span>
                                </div>
                                <div className="expense-item-meta-row">
                                  <span>
                                    <CalendarDays size={13} aria-hidden="true" />
                                    Bought {formatDate(record.purchase_date)}
                                  </span>
                                  <span>
                                    <Wallet size={13} aria-hidden="true" />
                                    {accountName(record.account_key)} ·{" "}
                                    {record.payment_details?.method ?? "Payment not recorded"}
                                  </span>
                                </div>
                                {record.notes && (
                                  <p className="expense-item-notes">{record.notes}</p>
                                )}
                              </div>
                              <div className="expense-item-amount-wrap">
                                <strong className="expense-item-amount">
                                  {formatPKRInLakhCrore(record.amount)}
                                </strong>
                                <span className="expense-item-exact">
                                  {formatPKR(record.amount)}
                                </span>
                              </div>
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
                                  <Trash2 size={16} />
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
  const [step, setStep] = useState(0);
  const steps = ["Purchase", "Amount", "Payment", "Review"];
  const [paymentDetails, setPaymentDetails] = useState(
    record?.payment_details ?? emptyPaymentDetails,
  );
  const [category, setCategory] = useState<ExpenseCategory>(record?.category ?? "car");
  const [name, setName] = useState(record?.item_name ?? "");
  const [amount, setAmount] = useState(record ? String(record.amount) : "");
  const [purchaseDate, setPurchaseDate] = useState(
    record?.purchase_date ?? format(new Date(), "yyyy-MM-dd"),
  );
  const [notes, setNotes] = useState(record?.notes ?? "");
  const [error, setError] = useState("");
  const [accountKey, setAccountKey] = useState(record?.account_key ?? "");
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (step === 0) {
      const details = PersonalExpenseSchema.pick({ category: true, item_name: true }).safeParse({
        category,
        item_name: name,
      });
      if (!details.success) {
        setError(details.error.issues[0]?.message ?? "Check the purchase details.");
        return;
      }
      setStep(1);
      return;
    }
    if (step === 1) {
      const amountCheck = PersonalExpenseSchema.pick({
        amount: true,
        purchase_date: true,
      }).safeParse({ amount: parseRupees(amount), purchase_date: purchaseDate });
      if (!amountCheck.success) {
        setError("Enter a valid amount and purchase date.");
        return;
      }
      setStep(2);
      return;
    }
    const result = PersonalExpenseSchema.safeParse({
      payment_details: paymentDetails,
      account_key: accountKey,
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
    if (step === 2) {
      setStep(3);
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
      <DialogContent className="expense-dialog expense-wizard max-h-[92vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <div className="expense-wizard-head">
            <span className="expense-wizard-icon">
              <ShoppingBag size={22} aria-hidden="true" />
            </span>
            <div>
              <DialogTitle>{record ? "Edit purchase" : "Add a personal purchase"}</DialogTitle>
              <p className="text-sm text-muted-foreground">
                Complete one short step at a time, then review your purchase.
              </p>
            </div>
          </div>
        </DialogHeader>
        <p role="status" className="text-sm font-semibold text-primary">
          Step {step + 1} of 4 · {steps[step]}
        </p>
        <ol className="expense-wizard-steps" aria-label="Purchase progress">
          {steps.map((label, index) => (
            <li
              key={label}
              aria-current={step === index ? "step" : undefined}
              data-complete={index < step}
            >
              <span className="expense-step-num">{index + 1}</span>
              <span className="expense-step-name">{label}</span>
            </li>
          ))}
        </ol>
        <form id="expense-form" onSubmit={submit} className="expense-form">
          {step === 0 && (
            <>
              <div>
                <Label htmlFor="expense-category">What did you buy? *</Label>
                <div className="expense-category-grid-select">
                  {categories.map((item) => {
                    const Icon = item.icon;
                    const isSelected = category === item.id;
                    return (
                      <button
                        type="button"
                        key={item.id}
                        aria-pressed={isSelected}
                        className={`expense-cat-option ${isSelected ? "is-selected" : ""}`}
                        style={{ "--cat-color": item.color } as CSSProperties}
                        onClick={() => {
                          setCategory(item.id as ExpenseCategory);
                          setName("");
                        }}
                      >
                        <span className="expense-cat-icon">
                          <Icon size={18} />
                        </span>
                        <span>{item.singular}</span>
                      </button>
                    );
                  })}
                </div>
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
            </>
          )}
          {step === 1 && (
            <>
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
            </>
          )}
          {step === 2 && (
            <div className="space-y-4">
              <BankAccountSelect value={accountKey} onChange={setAccountKey} />
              {accountKey && (
                <UdhaarPaymentDetails value={paymentDetails} onChange={setPaymentDetails} />
              )}
            </div>
          )}
          {step === 3 && (
            <>
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
                <span className="expense-preview-eyebrow">Purchase to record</span>
                <strong className="expense-preview-amount">
                  {parseRupees(amount) ? formatPKR(parseRupees(amount)!) : "Enter an amount"}
                </strong>
                <div className="expense-preview-list">
                  <small>{name.trim() || "Write what you bought above"}</small>
                  <small>
                    {categoryInfo(category).singular} · {formatDate(purchaseDate)}
                  </small>
                  <small>
                    {accountKey === "personal" ? "Personal Account" : "Builder Account"}
                  </small>
                  <small>{paymentSummary(JSON.stringify(paymentDetails))}</small>
                </div>
              </div>
            </>
          )}
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
          {step > 0 && (
            <Button
              type="button"
              variant="outline"
              disabled={saving}
              onClick={() => {
                setError("");
                setStep(step - 1);
              }}
            >
              Back
            </Button>
          )}
          <Button type="submit" form="expense-form" disabled={saving}>
            {saving ? "Saving…" : step < 3 ? "Next" : record ? "Save changes" : "Save purchase"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
