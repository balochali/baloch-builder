import { TimeSeriesChart, chartColors } from "@/components/charts/TimeSeriesChart";
import { useState } from "react";
import {
  differenceInCalendarDays,
  format,
  parseISO,
  startOfMonth,
  startOfWeek,
  startOfYear,
} from "date-fns";
import { BarChart3, CalendarDays, ChevronDown, HardHat, Layers3, SlidersHorizontal, TrendingUp, Wallet } from "lucide-react";
import { useRecordFilters } from "@/components/RecordFilters";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Transaction } from "@/domain/types";
import { formatPKR, formatPKRInLakhCrore } from "@/domain/money";
import { formatDate } from "@/lib/dates";
import { PaymentDetailsView } from "@/features/partners/components/PaymentDetailsView";
import { SavedImageGallery } from "@/features/documents/components/ImageGallery";
import type { DocumentRecord } from "@/data/repositories/documentsRepository";

type Period = "all" | "daily" | "weekly" | "monthly" | "yearly" | "custom";
const periodLabels: Record<Period, string> = {
  all: "All time",
  daily: "Today",
  weekly: "This week",
  monthly: "This month",
  yearly: "This year",
  custom: "Custom",
};
const itemName = (cost: Transaction) => cost.description?.trim() || "Other construction cost";
const itemKey = (cost: Transaction) => itemName(cost).toLocaleLowerCase();

function dateRange(period: Period, from: string, to: string) {
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

function TrendChart({
  costs,
  label,
  start,
  end,
}: {
  costs: Transaction[];
  label: string;
  start: string | null;
  end: string | null;
}) {
  if (costs.length === 0)
    return (
      <div className="construction-chart-empty">
        No payments for this item in the selected period.
      </div>
    );
  const dates = costs.map((cost) => cost.date).sort();
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
  const grouped = new Map<string, number>();
  costs.forEach((cost) => {
    const key = bucket(cost.date);
    grouped.set(key, (grouped.get(key) ?? 0) + cost.amount);
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
  const max = points[points.length - 1].amount;
  const display = (key: string) =>
    key.length === 4
      ? key
      : key.length === 7
        ? format(parseISO(`${key}-01`), "MMM yyyy")
        : formatDate(key);
  return (
    <>
      <strong className="construction-trend-total">
        {formatPKRInLakhCrore(max)} paid for {label.toLocaleLowerCase()}
      </strong>
      <TimeSeriesChart
        points={rows.map(([key], index) => ({
          key,
          label: display(key),
          values: { spent: points[index].amount },
        }))}
        series={[{ key: "spent", label: "Cumulative payments", color: chartColors.blue }]}
        ariaLabel={label + " spending rose to " + formatPKR(max)}
        caption={groupingNote + "Running total within the selected period."}
      />
      <p className="construction-chart-note">
        Each point adds payments for {label.toLocaleLowerCase()} on that date.
      </p>
    </>
  );
}

export function ConstructionCostInsights({ costs, receipts = [] }: { costs: Transaction[]; receipts?: DocumentRecord[] }) {
  const [period, setPeriod] = useState<Period>("all");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [selectedItem, setSelectedItem] = useState("all");
  const validRange = period !== "custom" || (!!customFrom && !!customTo && customFrom <= customTo);
  const { start, end } = dateRange(period, customFrom, customTo);
  const datedCosts = validRange
    ? costs.filter((cost) => (!start || cost.date >= start) && (!end || cost.date <= end))
    : [];
  const { visible: periodCosts, controls } = useRecordFilters(datedCosts, {
    label: "construction payments",
    searchText: (cost) => [cost.description, cost.reference].filter(Boolean).join(" "),
    amount: (cost) => cost.amount,
    facets: [{ label: "Payment method", value: (cost) => cost.method }],
  });
  const itemMap = new Map<string, { key: string; label: string; total: number; count: number }>();
  periodCosts.forEach((cost) => {
    const key = itemKey(cost);
    const current = itemMap.get(key);
    itemMap.set(key, {
      key,
      label: current?.label ?? itemName(cost),
      total: (current?.total ?? 0) + cost.amount,
      count: (current?.count ?? 0) + 1,
    });
  });
  const items = [...itemMap.values()].sort((a, b) => b.total - a.total);
  const largest = items[0]?.total ?? 1;
  const activeItem = items.some((item) => item.key === selectedItem) ? selectedItem : "all";
  const shownCosts =
    activeItem === "all" ? periodCosts : periodCosts.filter((cost) => itemKey(cost) === activeItem);
  const lineLabel =
    activeItem === "all"
      ? "All construction items"
      : (items.find((item) => item.key === activeItem)?.label ?? "All construction items");
  const periodTotal = periodCosts.reduce((total, cost) => total + cost.amount, 0);

  return (
    <div className="construction-insights">
      <section className="construction-filters" aria-label="Construction cost filters">
        <div>
          <h3>Choose a time period</h3>
          <p>See what you paid for construction each day, week, month or custom range.</p>
        </div>
        <div
          className="construction-period-options"
          role="group"
          aria-label="Construction cost time period"
        >
          {(Object.keys(periodLabels) as Period[]).map((option) => (
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
          <div className="construction-custom-range">
            <div>
              <Label htmlFor="construction-from">From date</Label>
              <Input
                id="construction-from"
                type="date"
                value={customFrom}
                onChange={(event) => setCustomFrom(event.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="construction-to">To date</Label>
              <Input
                id="construction-to"
                type="date"
                min={customFrom || undefined}
                value={customTo}
                onChange={(event) => setCustomTo(event.target.value)}
              />
            </div>
          </div>
        )}
        {!validRange ? (
          <p className="construction-range-error" role="status">
            Choose a start and end date, with the end on or after the start.
          </p>
        ) : (
          <span className="construction-range-caption">
            Showing:{" "}
            {period === "custom"
              ? `${formatDate(customFrom)} – ${formatDate(customTo)}`
              : periodLabels[period]}
          </span>
        )}
      </section>
      {validRange && (
        <>
          <div className="construction-period-summary">
            <div className="is-spent">
              <span className="construction-summary-icon"><Wallet size={21} /></span>
              <span>Paid in this period</span>
              <strong>{formatPKRInLakhCrore(periodTotal)}</strong>
              <small>{formatPKR(periodTotal)} in full</small>
            </div>
            <div className="is-payments">
              <span className="construction-summary-icon"><CalendarDays size={21} /></span>
              <span>Payments</span>
              <strong>{periodCosts.length}</strong>
              <small>Construction payments in this period</small>
            </div>
            <div className="is-items">
              <span className="construction-summary-icon"><Layers3 size={21} /></span>
              <span>Items paid for</span>
              <strong>{items.length}</strong>
              <small>Grouped by payment description</small>
            </div>
          </div>
          <details className="construction-search-drawer">
            <summary><span><SlidersHorizontal size={18} /> Search & filter payments</span><span>Refine results <ChevronDown size={16} /></span></summary>
            {controls}
          </details>
          {periodCosts.length === 0 ? (
            <div className="construction-chart-empty">
              <CalendarDays size={26} />
              <strong>No construction payments in this period</strong>
              <p>Choose another time period or add a construction cost.</p>
            </div>
          ) : (
            <>
              <div className="construction-charts">
                <section
                  className="construction-chart-card"
                  aria-label="Construction spending by item"
                >
                  <div className="construction-chart-title">
                    <BarChart3 size={20} />
                    <div>
                      <h3>Spending by item</h3>
                      <p>
                        Longer bars mean more money paid for that item. Select a bar to see its
                        trend.
                      </p>
                    </div>
                  </div>
                  <div className="construction-item-bars">
                    {items.map((item) => (
                      <button
                        type="button"
                        key={item.key}
                        className={activeItem === item.key ? "is-selected" : ""}
                        aria-pressed={activeItem === item.key}
                        onClick={() => setSelectedItem(item.key)}
                      >
                        <span>
                          <strong>{item.label}</strong>
                          <small>
                            {item.count} {item.count === 1 ? "payment" : "payments"} ·{" "}
                            {formatPKRInLakhCrore(item.total)}
                          </small>
                        </span>
                        <span className="construction-item-track">
                          <span style={{ width: `${(item.total / largest) * 100}%` }} />
                        </span>
                      </button>
                    ))}
                  </div>
                </section>
                <section
                  className="construction-chart-card"
                  aria-label="Construction item spending trend"
                >
                  <div className="construction-chart-title">
                    <TrendingUp size={20} />
                    <div>
                      <h3>How item spending changed</h3>
                      <p>See the running amount paid for one item or all construction items.</p>
                    </div>
                  </div>
                  <div className="construction-item-picker">
                    <Label htmlFor="construction-item-select">Show item</Label>
                    <select
                      id="construction-item-select"
                      value={activeItem}
                      onChange={(event) => setSelectedItem(event.target.value)}
                    >
                      <option value="all">All construction items</option>
                      {items.map((item) => (
                        <option key={item.key} value={item.key}>
                          {item.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <TrendChart costs={shownCosts} label={lineLabel} start={start} end={end} />
                </section>
              </div>
              <section
                className="construction-payment-list"
                aria-label="Construction payments in selected period"
              >
                <div>
                  <h3>
                    {activeItem === "all" ? "Payments in this period" : `Payments for ${lineLabel}`}
                  </h3>
                  <p>These are the payments included in the selected line.</p>
                </div>
                <div className="construction-payment-cards">
                  {shownCosts.map((cost) => (
                    <article key={cost.id} className="construction-payment-card">
                      <span className="construction-payment-icon"><HardHat size={19} /></span>
                      <div><strong>{itemName(cost)}</strong><span>{formatDate(cost.date)} · {cost.method || "Method not set"}</span>{cost.reference && <small>Ref: {cost.reference}</small>}<PaymentDetailsView transaction={cost} /><SavedImageGallery documents={receipts.filter((receipt) => receipt.owner_id === cost.id)} /></div>
                      <b>{formatPKR(cost.amount)}</b>
                    </article>
                  ))}
                </div>
              </section>
            </>
          )}
        </>
      )}
    </div>
  );
}
