import { BankAccountSelect } from "@/components/BankAccountSelect";
import { groupUdhaarPeople } from "@/domain/udhaarPeople";
import { listContacts } from "@/data/repositories/contactsRepository";
import type { Contact } from "@/domain/types";
import { RingChart } from "@/components/charts/RingChart";
import { TimeSeriesChart, chartColors } from "@/components/charts/TimeSeriesChart";
import { useEffect, useState, type FormEvent } from "react";
import {
  format,
  startOfWeek,
  startOfMonth,
  startOfYear,
  differenceInCalendarDays,
  parseISO,
} from "date-fns";
import {
  ArrowRight,
  CalendarDays,
  CircleCheck,
  HandCoins,
  Plus,
  UserRound,
  Wallet,
  TrendingUp,
  BarChart3,
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
  AddUdhaarPaymentSchema,
  CreateUdhaarSchema,
  addPersonUdhaarPayment,
  createUdhaar,
  listAllUdhaarPayments,
  listUdhaars,
  type AddUdhaarPaymentInput,
  type CreateUdhaarInput,
  type Udhaar,
  type UdhaarPayment,
} from "@/data/repositories/udhaarRepository";

function rupees(value: string): number | null {
  const trimmed = value.trim();
  if (!/^\d+(?:,\d+)*$/.test(trimmed)) return null;
  const amount = Number(trimmed.replace(/,/g, ""));
  return Number.isSafeInteger(amount) && amount > 0 ? amount : null;
}

const today = () => format(new Date(), "yyyy-MM-dd");
type Period = "all" | "daily" | "weekly" | "monthly" | "yearly" | "custom";
const periodNames: Record<Period, string> = {
  all: "All time",
  daily: "Today",
  weekly: "This week",
  monthly: "This month",
  yearly: "This year",
  custom: "Custom",
};

function dateRange(period: Period, customFrom: string, customTo: string) {
  const now = new Date();
  const end = period === "custom" ? customTo : period === "all" ? null : format(now, "yyyy-MM-dd");
  const start =
    period === "custom"
      ? customFrom
      : period === "daily"
        ? format(now, "yyyy-MM-dd")
        : period === "weekly"
          ? format(startOfWeek(now, { weekStartsOn: 1 }), "yyyy-MM-dd")
          : period === "monthly"
            ? format(startOfMonth(now), "yyyy-MM-dd")
            : period === "yearly"
              ? format(startOfYear(now), "yyyy-MM-dd")
              : null;
  return { start, end };
}

function inRange(date: string, start: string | null, end: string | null) {
  return (!start || date >= start) && (!end || date <= end);
}

function UdhaarActivityCharts({
  loans,
  payments,
  start,
  end,
  allLoans,
  allPayments,
}: {
  loans: Udhaar[];
  payments: UdhaarPayment[];
  start: string | null;
  end: string | null;
  allLoans: Udhaar[];
  allPayments: UdhaarPayment[];
}) {
  const events = [
    ...loans.map((loan) => ({ date: loan.given_date, given: loan.amount, paid: 0 })),
    ...payments.map((payment) => ({ date: payment.paid_date, given: 0, paid: payment.amount })),
  ];
  if (!events.length)
    return (
      <div className="udhaar-activity-empty">
        <BarChart3 size={27} />
        <strong>No money moved in this period</strong>
        <p>Choose another date range to see lending and repayments.</p>
      </div>
    );
  const dates = events.map((event) => event.date).sort();
  const span = differenceInCalendarDays(
    parseISO(end ?? dates[dates.length - 1]),
    parseISO(start ?? dates[0]),
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
  const grouped = new Map<string, { given: number; paid: number }>();
  events.forEach((event) => {
    const key = bucket(event.date);
    const current = grouped.get(key) ?? { given: 0, paid: 0 };
    grouped.set(key, { given: current.given + event.given, paid: current.paid + event.paid });
  });
  const rows = [...grouped]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => ({ key, ...value }));
  const before = start
    ? allLoans
        .filter((loan) => loan.given_date < start)
        .reduce((total, loan) => total + loan.amount, 0) -
      allPayments
        .filter((payment) => payment.paid_date < start)
        .reduce((total, payment) => total + payment.amount, 0)
    : 0;
  const points = rows.reduce<{ x: number; amount: number }[]>((result, row, index) => {
    const previous = result.length ? result[result.length - 1].amount : before;
    return [
      ...result,
      {
        x: rows.length === 1 ? 150 : 12 + (index / (rows.length - 1)) * 276,
        amount: Math.max(0, previous + row.given - row.paid),
      },
    ];
  }, []);
  const formatBucket = (key: string) =>
    key.length === 4
      ? key
      : key.length === 7
        ? format(parseISO(`${key}-01`), "MMM yyyy")
        : formatDate(key);
  return (
    <div className="udhaar-activity-grid">
      <section className="udhaar-activity-card" aria-label="Money given and paid back by date">
        <div className="udhaar-chart-head">
          <BarChart3 size={20} />
          <div>
            <h3>Money moving</h3>
            <p>Blue is money given; green is money paid back.</p>
          </div>
        </div>
        <TimeSeriesChart
          points={rows.map((row) => ({
            key: row.key,
            label: formatBucket(row.key),
            values: { given: row.given, paid: row.paid },
          }))}
          series={[
            { key: "given", label: "Money given", color: chartColors.blue },
            { key: "paid", label: "Paid back", color: chartColors.green },
          ]}
          defaultMode="bar"
          ariaLabel="Money given and paid back by date"
          pointLabel={(point) =>
            point.label +
            ": " +
            formatPKR(point.values.given) +
            " given, " +
            formatPKR(point.values.paid) +
            " paid back"
          }
          caption={groupingNote + "Hover or select a date for exact values."}
        />
      </section>
      <section className="udhaar-activity-card" aria-label="Outstanding balance trend">
        <div className="udhaar-chart-head">
          <TrendingUp size={20} />
          <div>
            <h3>Still to receive over time</h3>
            <p>The line rises when you lend and falls when someone pays back.</p>
          </div>
        </div>
        <strong className="udhaar-trend-total">
          {formatPKRInLakhCrore(points[points.length - 1].amount)}
        </strong>
        <TimeSeriesChart
          points={rows.map((row, index) => ({
            key: row.key,
            label: formatBucket(row.key),
            values: { balance: points[index].amount },
          }))}
          series={[{ key: "balance", label: "Still to receive", color: chartColors.coral }]}
          ariaLabel={"Outstanding balance reached " + formatPKR(points[points.length - 1].amount)}
          caption={
            groupingNote +
            "Opening balance: " +
            formatPKR(before) +
            ". Each point is the balance at the end of that period."
          }
        />
      </section>
    </div>
  );
}

export function CreditUdhaarPage() {
  const [records, setRecords] = useState<Udhaar[]>([]);
  const [allPayments, setAllPayments] = useState<UdhaarPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [view, setView] = useState<"overview" | "people">("overview");
  const [period, setPeriod] = useState<Period>("all");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const people = groupUdhaarPeople(records);
  const selected = people.find((person) => person.id === selectedId) ?? null;
  const personPayments = new Map<string, UdhaarPayment>();
  for (const payment of allPayments.filter((payment) =>
    selected?.loans.some((loan) => loan.id === payment.udhaar_id),
  )) {
    const key = payment.payment_group_id ?? payment.id;
    const existing = personPayments.get(key);
    personPayments.set(key, {
      ...payment,
      id: key,
      amount: payment.amount + (existing?.amount ?? 0),
    });
  }
  const history = selected
    ? [
        ...selected.loans.map((loan) => ({
          id: "given-" + loan.id,
          date: loan.given_date,
          amount: loan.amount,
          kind: "Money given",
          method: "",
          notes: loan.notes,
          loanDate: loan.given_date,
        })),
        ...[...personPayments.values()].map((payment) => ({
          id: payment.id,
          date: payment.paid_date,
          amount: payment.amount,
          kind: "Paid back",
          method: payment.method,
          notes: payment.notes,
          loanDate: selected.loans.find((loan) => loan.id === payment.udhaar_id)!.given_date,
        })),
      ].sort((a, b) => b.date.localeCompare(a.date))
    : [];
  const { visible, controls } = useRecordFilters(people, {
    label: "udhaar records",
    searchText: (record) =>
      [record.borrower_name, record.phone, record.notes].filter(Boolean).join(" "),
    date: (record) => record.given_date,
    dateLabel: "Latest loan",
    amount: (record) => Math.max(0, record.amount - record.paid_amount),
    facets: [
      {
        label: "Repayment status",
        value: (record) =>
          record.paid_amount >= record.amount
            ? "Settled"
            : record.due_date && record.due_date < format(new Date(), "yyyy-MM-dd")
              ? "Overdue"
              : record.paid_amount > 0
                ? "Partly paid"
                : "Unpaid",
      },
    ],
  });
  const validRange = period !== "custom" || (!!customFrom && !!customTo && customFrom <= customTo);
  const { start, end } = dateRange(period, customFrom, customTo);
  const periodLoans = validRange
    ? records.filter((record) => inRange(record.given_date, start, end))
    : [];
  const periodPayments = validRange
    ? allPayments.filter((payment) => inRange(payment.paid_date, start, end))
    : [];
  const totalLent = periodLoans.reduce((total, record) => total + record.amount, 0);
  const totalPaid = periodPayments.reduce((total, payment) => total + payment.amount, 0);
  const loansToEnd = validRange ? records.filter((record) => !end || record.given_date <= end) : [];
  const paymentsToEnd = validRange
    ? allPayments.filter((payment) => !end || payment.paid_date <= end)
    : [];
  const givenToEnd = loansToEnd.reduce((total, record) => total + record.amount, 0);
  const paidToEnd = paymentsToEnd.reduce((total, payment) => total + payment.amount, 0);
  const totalRemaining = Math.max(0, givenToEnd - paidToEnd);
  const paidPercent = givenToEnd > 0 ? Math.min(100, (paidToEnd / givenToEnd) * 100) : 0;
  const largestBalances = groupUdhaarPeople(
    loansToEnd.map((loan) => ({
      ...loan,
      paid_amount: paymentsToEnd
        .filter((payment) => payment.udhaar_id === loan.id)
        .reduce((sum, payment) => sum + payment.amount, 0),
    })),
  )
    .map((record) => ({ record, balance: Math.max(0, record.amount - record.paid_amount) }))
    .filter((item) => item.balance > 0)
    .sort((a, b) => b.balance - a.balance)
    .slice(0, 4);
  const largestBalance = largestBalances[0]?.balance ?? 0;
  const periodLabel =
    period === "custom" && validRange
      ? `${formatDate(customFrom)} – ${formatDate(customTo)}`
      : periodNames[period];

  useEffect(() => {
    let active = true;
    Promise.all([listUdhaars(), listAllUdhaarPayments()])
      .then(([rows, paymentRows]) => {
        if (active) {
          setRecords(rows);
          setAllPayments(paymentRows);
        }
      })
      .catch((cause) => {
        if (active) setError(String(cause));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  async function refresh() {
    const [rows, paymentRows] = await Promise.all([listUdhaars(), listAllUdhaarPayments()]);
    setRecords(rows);
    setAllPayments(paymentRows);
  }
  async function addRecord(value: CreateUdhaarInput) {
    await createUdhaar(value);
    toast.success("Udhaar recorded");
    try {
      await refresh();
    } catch {
      toast.error("Saved. Refresh the page to see the latest records.");
    }
  }
  async function addPayment(value: AddUdhaarPaymentInput) {
    await addPersonUdhaarPayment(value);
    toast.success("Repayment recorded");
    try {
      await refresh();
    } catch {
      toast.error("Saved. Refresh the page to see the latest balance.");
    }
  }
  function openDetails(id: string) {
    setSelectedId(id);
  }

  return (
    <main className="udhaar-page">
      <div className="udhaar-heading">
        <div>
          <p className="projects-eyebrow">Money you gave</p>
          <h1>Credit / Udhaar</h1>
          <p>See who owes you money, how much has come back, and what is still due.</p>
        </div>
        <Button onClick={() => setAddOpen(true)}>
          <Plus size={18} />
          Give Udhaar
        </Button>
      </div>
      <div className="udhaar-tabs" role="tablist" aria-label="Credit and Udhaar views">
        {(["overview", "people"] as const).map((tab, index) => (
          <button
            type="button"
            role="tab"
            key={tab}
            id={`udhaar-tab-${tab}`}
            aria-selected={view === tab}
            aria-controls={`udhaar-panel-${tab}`}
            tabIndex={view === tab ? 0 : -1}
            onClick={() => setView(tab)}
            onKeyDown={(event) => {
              const next =
                event.key === "ArrowRight"
                  ? (index + 1) % 2
                  : event.key === "ArrowLeft"
                    ? (index + 1) % 2
                    : event.key === "Home"
                      ? 0
                      : event.key === "End"
                        ? 1
                        : -1;
              if (next >= 0) {
                event.preventDefault();
                const target = next === 0 ? "overview" : "people";
                setView(target);
                document.getElementById(`udhaar-tab-${target}`)?.focus();
              }
            }}
          >
            {tab === "overview" ? "Overview" : "People & balances"}
            {tab === "people" && records.length > 0 && <span>{people.length}</span>}
          </button>
        ))}
      </div>
      {loading && <p className="py-8 text-muted-foreground">Loading udhaar records…</p>}
      {!loading && error && (
        <p role="alert" className="py-8 text-destructive">
          Could not load udhaar records: {error}
        </p>
      )}
      {!loading && !error && (
        <>
          {view === "overview" && (
            <section
              id="udhaar-panel-overview"
              role="tabpanel"
              aria-labelledby="udhaar-tab-overview"
              className="udhaar-tab-panel"
            >
              <div className="udhaar-filter-panel">
                <div>
                  <strong>Choose a time period</strong>
                  <p>
                    Given and paid back show activity in this period. Still to receive shows the
                    balance at its end.
                  </p>
                </div>
                <div className="udhaar-filter-options" role="group" aria-label="Udhaar time period">
                  {(Object.keys(periodNames) as Period[]).map((option) => (
                    <button
                      type="button"
                      key={option}
                      aria-pressed={period === option}
                      onClick={() => setPeriod(option)}
                    >
                      {periodNames[option]}
                    </button>
                  ))}
                </div>
                {period === "custom" && (
                  <div className="udhaar-custom-range">
                    <div>
                      <Label htmlFor="udhaar-from">From date</Label>
                      <Input
                        id="udhaar-from"
                        type="date"
                        value={customFrom}
                        onChange={(event) => setCustomFrom(event.target.value)}
                      />
                    </div>
                    <div>
                      <Label htmlFor="udhaar-to">To date</Label>
                      <Input
                        id="udhaar-to"
                        type="date"
                        min={customFrom || undefined}
                        value={customTo}
                        onChange={(event) => setCustomTo(event.target.value)}
                      />
                    </div>
                  </div>
                )}
                {!validRange && (
                  <p className="udhaar-filter-error" role="status">
                    Choose a start and end date, with the end on or after the start.
                  </p>
                )}
                {validRange && (
                  <span className="udhaar-filter-caption">Showing: {periodLabel}</span>
                )}
              </div>
              {validRange && (
                <>
                  <div className="udhaar-summary">
                    <div className="udhaar-summary-given">
                      <span className="udhaar-summary-icon">
                        <HandCoins size={23} />
                      </span>
                      <span>{period === "all" ? "Total given" : "Given in this period"}</span>
                      <strong>{formatPKRInLakhCrore(totalLent)}</strong>
                      <small>
                        {totalLent >= 100_000
                          ? `${formatPKR(totalLent, { lakhCrore: true })} in full`
                          : "Money you lent"}
                      </small>
                    </div>
                    <div className="udhaar-summary-paid">
                      <span className="udhaar-summary-icon">
                        <CircleCheck size={23} />
                      </span>
                      <span>{period === "all" ? "Paid back" : "Paid back in this period"}</span>
                      <strong>{formatPKRInLakhCrore(totalPaid)}</strong>
                      <small>
                        {totalPaid >= 100_000
                          ? `${formatPKR(totalPaid, { lakhCrore: true })} in full`
                          : "Money received from people"}
                      </small>
                    </div>
                    <div className="udhaar-summary-remaining">
                      <span className="udhaar-summary-icon">
                        <Wallet size={23} />
                      </span>
                      <span>
                        {period === "all" ? "Still to receive" : "Still to receive at period end"}
                      </span>
                      <strong>{formatPKRInLakhCrore(totalRemaining)}</strong>
                      <small>
                        {totalRemaining >= 100_000
                          ? `${formatPKR(totalRemaining, { lakhCrore: true })} in full`
                          : "Money people still owe you"}
                      </small>
                    </div>
                  </div>
                  {records.length > 0 && (
                    <section className="udhaar-insights" aria-label="Udhaar at a glance">
                      <div className="udhaar-insight-intro">
                        <p className="projects-eyebrow">At a glance</p>
                        <h2>How much has come back?</h2>
                        <p>
                          Green shows money paid back. Coral shows money still to receive
                          {period === "all" ? "." : " at the end of the selected period."}
                        </p>
                      </div>
                      <div className="udhaar-insight-body">
                        <div className="udhaar-donut-layout">
                          <RingChart
                            value={Math.round(paidPercent) + "%"}
                            label="paid back"
                            ariaLabel={
                              formatPKR(paidToEnd) +
                              " paid back and " +
                              formatPKR(totalRemaining) +
                              " still to receive"
                            }
                            segments={[
                              {
                                label: "Paid back",
                                value: paidToEnd,
                                color: chartColors.green,
                                display: formatPKR(paidToEnd),
                              },
                              {
                                label: "Still to receive",
                                value: totalRemaining,
                                color: chartColors.coral,
                                display: formatPKR(totalRemaining),
                              },
                            ]}
                          />
                          <div className="udhaar-donut-legend">
                            <div>
                              <i className="is-paid" />
                              <span>Paid back</span>
                              <strong>{formatPKRInLakhCrore(paidToEnd)}</strong>
                            </div>
                            <div>
                              <i className="is-remaining" />
                              <span>Still to receive</span>
                              <strong>{formatPKRInLakhCrore(totalRemaining)}</strong>
                            </div>
                            <p>Out of {formatPKRInLakhCrore(givenToEnd)} given up to this date.</p>
                          </div>
                        </div>
                        <div className="udhaar-balance-chart">
                          <h3>Largest amounts still due</h3>
                          <p>
                            People with the most money left to return at the end of this period.
                          </p>
                          {largestBalances.length === 0 ? (
                            <span className="udhaar-all-paid">Everyone has paid back in full.</span>
                          ) : (
                            largestBalances.map(({ record, balance }) => {
                              return (
                                <div className="udhaar-balance-row" key={record.id}>
                                  <div>
                                    <strong>{record.borrower_name}</strong>
                                    <span>{formatPKRInLakhCrore(balance)}</span>
                                  </div>
                                  <span className="udhaar-balance-track">
                                    <span
                                      style={{ width: `${(balance / largestBalance) * 100}%` }}
                                    />
                                  </span>
                                </div>
                              );
                            })
                          )}
                        </div>
                      </div>
                    </section>
                  )}
                  {records.length > 0 && (
                    <UdhaarActivityCharts
                      loans={periodLoans}
                      payments={periodPayments}
                      start={start}
                      end={end}
                      allLoans={records}
                      allPayments={allPayments}
                    />
                  )}
                  {records.length === 0 && (
                    <div className="udhaar-empty">
                      <HandCoins size={34} />
                      <h2>Your overview starts here</h2>
                      <p>Add the first udhaar to see how much has been given and paid back.</p>
                      <Button onClick={() => setAddOpen(true)}>
                        <Plus size={17} />
                        Give Udhaar
                      </Button>
                    </div>
                  )}
                  {records.length > 0 && (
                    <Button
                      variant="outline"
                      className="udhaar-view-people"
                      onClick={() => setView("people")}
                    >
                      See people and remaining balances <ArrowRight size={17} />
                    </Button>
                  )}
                </>
              )}
            </section>
          )}
          {view === "people" && (
            <section
              id="udhaar-panel-people"
              role="tabpanel"
              aria-labelledby="udhaar-tab-people"
              className="udhaar-tab-panel"
            >
              <div className="udhaar-list-heading">
                <div>
                  <h2>People who owe you</h2>
                  <p>Select a person to see payments and record money received.</p>
                </div>
                <span>
                  {people.length} {people.length === 1 ? "person" : "people"}
                </span>
              </div>
              {controls}
              <p className="scope-note">
                Amount filters use the remaining balance. Date filters use each person’s latest loan
                date. Totals include all their loans.
              </p>
              {records.length === 0 ? (
                <div className="udhaar-empty">
                  <HandCoins size={34} />
                  <h2>No udhaar recorded yet</h2>
                  <p>Start by adding the name, amount and date for money you have given.</p>
                  <Button onClick={() => setAddOpen(true)}>
                    <Plus size={17} />
                    Give Udhaar
                  </Button>
                </div>
              ) : visible.length === 0 ? (
                <p className="rounded-xl border p-8 text-center text-muted-foreground">
                  No udhaar records match your search.
                </p>
              ) : (
                <div className="udhaar-cards">
                  {visible.map((record) => {
                    const remaining = Math.max(0, record.amount - record.paid_amount);
                    const percent = Math.min(100, (record.paid_amount / record.amount) * 100);
                    return (
                      <button
                        className={`udhaar-card ${remaining === 0 ? "is-settled" : record.paid_amount > 0 ? "is-partial" : "is-unpaid"}`}
                        type="button"
                        key={record.id}
                        onClick={() => openDetails(record.id)}
                        aria-label={`View ${record.borrower_name}'s udhaar`}
                      >
                        <span className="udhaar-card-top">
                          <span className="udhaar-avatar">
                            <UserRound size={25} />
                          </span>
                          <span className="udhaar-card-person">
                            <strong>{record.borrower_name}</strong>
                            <small>{record.phone || "Phone not added"}</small>
                          </span>
                          <ArrowRight size={19} />
                        </span>
                        <span className="udhaar-card-status">
                          {remaining === 0 ? (
                            <>
                              <CircleCheck size={15} />
                              Paid in full
                            </>
                          ) : record.paid_amount > 0 ? (
                            "Partly paid"
                          ) : (
                            "Not paid yet"
                          )}
                        </span>
                        <span className="udhaar-card-amount">
                          <small>Still to receive</small>
                          <strong>{formatPKRInLakhCrore(remaining)}</strong>
                          {remaining >= 100_000 && (
                            <em>{formatPKR(remaining, { lakhCrore: true })} exactly</em>
                          )}
                        </span>
                        <span className="udhaar-progress-caption">
                          <span>Repayment progress</span>
                          <strong>{Math.round(percent)}% paid</strong>
                        </span>
                        <span
                          className="udhaar-progress"
                          role="img"
                          aria-label={`${formatPKR(record.paid_amount)} repaid out of ${formatPKR(record.amount)}`}
                        >
                          <span style={{ width: `${percent}%` }} />
                        </span>
                        <span className="udhaar-card-split">
                          <span>
                            Given <strong>{formatPKRInLakhCrore(record.amount)}</strong>
                          </span>
                          <span>
                            Paid back <strong>{formatPKRInLakhCrore(record.paid_amount)}</strong>
                          </span>
                        </span>
                        <span className="udhaar-card-date">
                          <CalendarDays size={14} />
                          {record.loans.length} {record.loans.length === 1 ? "loan" : "loans"} ·
                          Latest {formatDate(record.given_date)}
                          {record.due_date ? ` · Due ${formatDate(record.due_date)}` : ""}
                        </span>
                        <span className="udhaar-card-action">
                          View details <ArrowRight size={16} />
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </section>
          )}
        </>
      )}
      {addOpen && <UdhaarForm onClose={() => setAddOpen(false)} onSave={addRecord} />}
      <Dialog
        open={!!selected && !paymentOpen}
        onOpenChange={(open) => {
          if (!open) setSelectedId(null);
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle>{selected.borrower_name}'s udhaar</DialogTitle>
              </DialogHeader>
              <p className="text-sm text-muted-foreground">
                {selected.phone || "No phone number saved"} · Latest loan{" "}
                {formatDate(selected.given_date)}
                {selected.due_date ? ` · Due ${formatDate(selected.due_date)}` : ""}
              </p>
              <div className="udhaar-detail-totals">
                <div>
                  <span>Given</span>
                  <strong>{formatPKR(selected.amount)}</strong>
                </div>
                <div>
                  <span>Paid back</span>
                  <strong>{formatPKR(selected.paid_amount)}</strong>
                </div>
                <div>
                  <span>Remaining</span>
                  <strong>{formatPKR(Math.max(0, selected.amount - selected.paid_amount))}</strong>
                </div>
              </div>
              {selected.notes && (
                <p className="rounded-lg bg-muted p-3 text-sm">{selected.notes}</p>
              )}
              <div className="udhaar-history-heading">
                <h3>Money given &amp; received</h3>
                <span>
                  {selected.loans.length} loans · {personPayments.size} repayments
                </span>
              </div>
              <div className="udhaar-history">
                {history.map((item) => (
                  <div key={item.id}>
                    <span>
                      <strong>
                        {item.kind} · {formatDate(item.date)}
                      </strong>
                      <small>
                        {item.method}
                        {item.notes ? " · " + item.notes : ""}
                      </small>
                    </span>
                    <strong className={item.kind === "Paid back" ? "text-emerald-600" : ""}>
                      {formatPKR(item.amount)}
                    </strong>
                  </div>
                ))}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setSelectedId(null)}>
                  Close
                </Button>
                {selected.amount > selected.paid_amount && (
                  <Button onClick={() => setPaymentOpen(true)}>
                    <Plus size={17} />
                    Record repayment
                  </Button>
                )}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
      {selected && paymentOpen && (
        <RepaymentForm
          record={selected}
          onClose={() => setPaymentOpen(false)}
          onSave={addPayment}
        />
      )}
    </main>
  );
}

function UdhaarForm({
  onClose,
  onSave,
}: {
  onClose: () => void;
  onSave: (value: CreateUdhaarInput) => Promise<void>;
}) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [contactId, setContactId] = useState<string | null>(null);
  const [peopleLoading, setPeopleLoading] = useState(true);
  const [peopleError, setPeopleError] = useState("");
  useEffect(() => {
    let active = true;
    listContacts()
      .then((rows) => {
        if (active) setContacts(rows);
      })
      .catch(() => {
        if (active)
          setPeopleError("Could not load saved people. Close and reopen this form to retry.");
      })
      .finally(() => {
        if (active) setPeopleLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [accountKey, setAccountKey] = useState("");
  const [amount, setAmount] = useState("");
  const [givenDate, setGivenDate] = useState(today());
  const [dueDate, setDueDate] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const search = name.trim().toLocaleLowerCase();
  const matches =
    !contactId && search
      ? contacts
          .filter((person) =>
            [person.name, person.phone, person.phone2].some((value) =>
              value?.toLocaleLowerCase().includes(search),
            ),
          )
          .slice(0, 8)
      : [];
  function selectPerson(person: Contact) {
    setContactId(person.id);
    setName(person.name);
    setPhone(person.phone ?? "");
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const result = CreateUdhaarSchema.safeParse({
      contact_id: contactId,
      account_key: accountKey,
      borrower_name: name,
      phone,
      amount: rupees(amount),
      given_date: givenDate,
      due_date: dueDate || null,
      notes,
    });
    if (!result.success) {
      setError(result.error.issues[0]?.message ?? "Check the details.");
      return;
    }
    setSaving(true);
    try {
      await onSave(result.data);
      onClose();
    } catch (cause) {
      setError(`Could not save udhaar: ${String(cause)}`);
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
      <DialogContent className="udhaar-entry-dialog max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader className="udhaar-entry-header">
          <span className="udhaar-entry-icon">
            <HandCoins size={26} aria-hidden="true" />
          </span>
          <div>
            <p className="udhaar-entry-eyebrow">NEW MONEY LENT</p>
            <DialogTitle>Give Udhaar</DialogTitle>
            <p>Write down who received the money and when. You can record repayments later.</p>
          </div>
        </DialogHeader>
        <form id="udhaar-form" onSubmit={submit} className="udhaar-entry-form">
          <BankAccountSelect value={accountKey} onChange={setAccountKey} />
          <section className="udhaar-entry-section" aria-labelledby="udhaar-person-heading">
            <div className="udhaar-entry-section-title">
              <span>1</span>
              <div>
                <h3 id="udhaar-person-heading">Who received the money?</h3>
                <p>Search saved people by name or phone, or enter a new person.</p>
              </div>
            </div>
            <div className="udhaar-entry-grid">
              <div className="udhaar-entry-field">
                <Label htmlFor="udhaar-name">Person's name *</Label>
                <Input
                  id="udhaar-name"
                  value={name}
                  onChange={(event) => {
                    setName(event.target.value);
                    if (contactId) {
                      setContactId(null);
                      setPhone("");
                    }
                  }}
                  autoComplete="off"
                  aria-describedby="udhaar-person-help"
                  placeholder="e.g. Ali Baloch"
                  autoFocus
                  required
                />
                <div
                  id="udhaar-person-help"
                  className="mt-2 text-sm text-muted-foreground"
                  aria-live="polite"
                >
                  {peopleLoading
                    ? "Loading saved people…"
                    : peopleError ||
                      (contactId
                        ? "Linked to Contacts. Name and phone stay in sync. Edit the name above to choose a different person."
                        : "Choose a saved person below, or save this name as a new contact.")}
                </div>
                {matches.length > 0 && (
                  <div
                    className="mt-2 max-h-52 overflow-y-auto rounded-lg border bg-background p-1"
                    aria-label="Suggested people"
                  >
                    {matches.map((person) => (
                      <button
                        type="button"
                        key={person.id}
                        onClick={() => selectPerson(person)}
                        className="block w-full rounded-md px-3 py-2 text-left text-sm hover:bg-muted focus-visible:bg-muted focus-visible:outline-2"
                      >
                        <strong className="block">{person.name}</strong>
                        <span className="text-muted-foreground">
                          {person.phone || person.phone2 || "No phone"}
                          {person.address ? " · " + person.address : ""}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="udhaar-entry-field">
                <Label htmlFor="udhaar-phone">Phone (optional)</Label>
                <Input
                  id="udhaar-phone"
                  readOnly={!!contactId}
                  type="tel"
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  placeholder="e.g. 0300 1234567"
                />
              </div>
            </div>
          </section>
          <section className="udhaar-entry-section" aria-labelledby="udhaar-money-heading">
            <div className="udhaar-entry-section-title">
              <span>2</span>
              <div>
                <h3 id="udhaar-money-heading">How much did you give?</h3>
                <p>Enter the amount and the day you handed it over.</p>
              </div>
            </div>
            <div className="udhaar-entry-field udhaar-entry-amount">
              <Label htmlFor="udhaar-amount">Amount given (Rs) *</Label>
              <Input
                id="udhaar-amount"
                inputMode="numeric"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                placeholder="e.g. 50,000"
                aria-describedby="udhaar-amount-help"
                required
              />
              <small id="udhaar-amount-help">
                Whole rupees only. Repayments will reduce this balance.
              </small>
            </div>
            <div className="udhaar-entry-grid">
              <div className="udhaar-entry-field">
                <Label htmlFor="udhaar-date">Date given *</Label>
                <Input
                  id="udhaar-date"
                  type="date"
                  value={givenDate}
                  onChange={(event) => setGivenDate(event.target.value)}
                  required
                />
              </div>
              <div className="udhaar-entry-field">
                <Label htmlFor="udhaar-due">Expected return date (optional)</Label>
                <Input
                  id="udhaar-due"
                  type="date"
                  min={givenDate}
                  value={dueDate}
                  onChange={(event) => setDueDate(event.target.value)}
                />
                <small>Leave blank if no return date was agreed.</small>
              </div>
            </div>
          </section>
          <section className="udhaar-entry-section" aria-labelledby="udhaar-notes-heading">
            <div className="udhaar-entry-section-title">
              <span>3</span>
              <div>
                <h3 id="udhaar-notes-heading">Anything else to remember?</h3>
                <p>Add a short note if it will help identify this udhaar.</p>
              </div>
            </div>
            <div className="udhaar-entry-field">
              <Label htmlFor="udhaar-notes">Notes (optional)</Label>
              <Input
                id="udhaar-notes"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="e.g. Given for shop supplies"
              />
            </div>
          </section>
          <div className="udhaar-entry-preview" aria-live="polite">
            <span>Amount to be recorded</span>
            <strong>{rupees(amount) ? formatPKR(rupees(amount)!) : "Enter an amount"}</strong>
            <small>{name.trim() ? `For ${name.trim()}` : "Add the person's name above"}</small>
          </div>
          {error && (
            <p role="alert" className="udhaar-entry-error">
              {error}
            </p>
          )}
        </form>
        <DialogFooter className="udhaar-entry-footer">
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" form="udhaar-form" disabled={saving}>
            {saving ? "Saving…" : "Save udhaar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RepaymentForm({
  record,
  onClose,
  onSave,
}: {
  record: Udhaar;
  onClose: () => void;
  onSave: (value: AddUdhaarPaymentInput) => Promise<void>;
}) {
  const remaining = record.amount - record.paid_amount;
  const [accountKey, setAccountKey] = useState("");
  const [amount, setAmount] = useState("");
  const [paidDate, setPaidDate] = useState(today());
  const [method, setMethod] = useState<"cash" | "bank" | "cheque" | "other">("cash");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const result = AddUdhaarPaymentSchema.safeParse({
      account_key: accountKey,
      udhaar_id: record.id,
      amount: rupees(amount),
      paid_date: paidDate,
      method,
      notes,
    });
    if (!result.success) {
      setError(result.error.issues[0]?.message ?? "Check the repayment.");
      return;
    }
    if (result.data.amount > remaining) {
      setError(`Payment cannot exceed ${formatPKR(remaining)} remaining.`);
      return;
    }
    setSaving(true);
    try {
      await onSave(result.data);
      onClose();
    } catch (cause) {
      setError(`Could not save repayment: ${String(cause)}`);
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
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Record repayment from {record.borrower_name}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Total still to receive: <strong>{formatPKR(remaining)}</strong>
        </p>
        <form id="udhaar-payment-form" onSubmit={submit} className="space-y-4">
          <BankAccountSelect value={accountKey} onChange={setAccountKey} direction="in" />
          <div>
            <Label htmlFor="repayment-amount">Amount received (Rs) *</Label>
            <Input
              id="repayment-amount"
              inputMode="numeric"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              placeholder="e.g. 10,000"
              required
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="repayment-date">Date received *</Label>
              <Input
                id="repayment-date"
                type="date"
                value={paidDate}
                onChange={(event) => setPaidDate(event.target.value)}
                required
              />
            </div>
            <div>
              <Label htmlFor="repayment-method">Payment method</Label>
              <select
                id="repayment-method"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={method}
                onChange={(event) => setMethod(event.target.value as typeof method)}
              >
                <option value="cash">Cash</option>
                <option value="bank">Bank</option>
                <option value="cheque">Cheque</option>
                <option value="other">Other</option>
              </select>
            </div>
          </div>
          <div>
            <Label htmlFor="repayment-notes">Notes (optional)</Label>
            <Input
              id="repayment-notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Receipt or transfer reference"
            />
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
          <Button type="submit" form="udhaar-payment-form" disabled={saving}>
            {saving ? "Saving…" : "Save repayment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
