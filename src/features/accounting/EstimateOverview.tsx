import { useEffect, useState } from "react";
import { Users, Plus, Wallet, Banknote, TrendingUp } from "lucide-react";
import { formatPKR } from "@baloch/shared";
import { z } from "zod";
import { api } from "@/data/api";
import type { Row } from "./Grid";
import {
  allocation,
  equalPartners,
  overviewTotals,
  sharePoints,
  type PartnerPlan,
} from "./estimateOverviewModel";
const planSchema = z
  .array(
    z.object({
      name: z.string().max(100),
      share: z.string().refine((s) => sharePoints(s) !== null),
    }),
  )
  .min(1)
  .max(100);
export function EstimateOverview({
  projectId,
  marlaSqft,
}: {
  projectId: string;
  marlaSqft: string;
}) {
  const [data, setData] = useState<{ costs: Row[]; sales: Row[] } | null>(null);
  const [error, setError] = useState(""),
    [revision, setRevision] = useState(0);
  const [partners, setPartners] = useState<PartnerPlan[]>([]),
    [count, setCount] = useState("2"),
    [open, setOpen] = useState(false);
  const [message, setMessage] = useState(""),
    [saving, setSaving] = useState(false),
    [changed, setChanged] = useState(false);
  const viewPath = `views/estimate-partner-plan-${projectId}`;
  useEffect(() => {
    let active = true;
    Promise.all([
      api<Row[]>(`projects/${projectId}/workbook/estimate`),
      api<Row[]>(`projects/${projectId}/workbook/sales_estimate`),
      api<Row[]>(`projects/${projectId}/workbook/partners`),
      api<{ filters?: { partners?: unknown } } | null>(viewPath),
    ])
      .then(([costs, sales, registered, view]) => {
        if (!active) return;
        setData({ costs, sales });
        const saved = planSchema.safeParse(view?.filters?.partners);
        const initial = saved.success
          ? saved.data
          : registered.map((r) => ({
              name: String(r.name ?? "Partner"),
              share: String(r.share ?? "0"),
            }));
        setPartners(initial);
        setCount(String(initial.length || 2));
        setOpen(initial.length > 0);
        setChanged(false);
      })
      .catch((e) => {
        if (active) setError(String(e));
      });
    return () => {
      active = false;
    };
  }, [projectId, viewPath, revision]);
  if (!data)
    return (
      <div className="estimate-dashboard" role="tabpanel">
        {error ? (
          <>
            <p role="alert">Unable to load overview: {error}</p>
            <button
              onClick={() => {
                setError("");
                setRevision((r) => r + 1);
              }}
            >
              Retry
            </button>
          </>
        ) : (
          <p role="status">Loading estimate overview...</p>
        )}
      </div>
    );
  const total = overviewTotals(data.costs, data.sales, marlaSqft),
    ready = total.costCount > 0 && total.salesCount > 0;
  const points = partners.map((p) => sharePoints(p.share)),
    assigned = points.reduce<number>((n, p) => n + (p ?? 0), 0);
  const valid = points.every((p) => p !== null) && assigned <= 10000;
  const amount = (n: bigint, available: boolean) => (available ? formatPKR(n) : "Not entered");
  function update(index: number, key: keyof PartnerPlan, value: string) {
    setPartners((ps) => ps.map((p, i) => (i === index ? { ...p, [key]: value } : p)));
    setChanged(true);
    setMessage("");
  }
  async function save() {
    if (!valid) return;
    setSaving(true);
    setMessage("");
    try {
      await api(viewPath, "PUT", { columns: [], filters: { partners } });
      setChanged(false);
      setMessage("Scenario saved for your account.");
    } catch (e) {
      setMessage(`Could not save scenario: ${String(e)}`);
    } finally {
      setSaving(false);
    }
  }
  const cards = [
    {
      title: "Estimated investment",
      style: "cost-card",
      Icon: Wallet,
      low: "Minimum cost",
      high: "Maximum cost",
      min: total.minCost,
      max: total.maxCost,
      available: total.costCount > 0,
    },
    {
      title: "Estimated sales",
      style: "sales-card",
      Icon: Banknote,
      low: "Minimum sales",
      high: "Maximum sales",
      min: total.minSales,
      max: total.maxSales,
      available: total.salesCount > 0,
    },
    {
      title: "Projected profit / loss",
      style: ready && total.minProfit < 0n ? "loss-card" : "profit-card",
      Icon: TrendingUp,
      low: "Conservative",
      high: "Optimistic",
      min: total.minProfit,
      max: total.maxProfit,
      available: ready,
    },
  ];
  return (
    <div className="estimate-dashboard" role="tabpanel" aria-label="Estimate overview">
      <header className="estimate-dashboard-title">
        <div>
          <span className="dashboard-eyebrow">PROJECT FORECAST</span>
          <h3>Estimate overview</h3>
          <p>Based on saved Cost and Sales estimates - PKR</p>
        </div>
        <button className="dashboard-partner-button" onClick={() => setOpen((v) => !v)}>
          <Users size={18} />
          {open ? "Hide partner calculator" : "Add partners"}
        </button>
      </header>
      {total.excluded > 0 && (
        <p role="alert">
          {total.excluded} incomplete or invalid estimate rows excluded. Correct them in Cost or
          Sales.
        </p>
      )}
      {!ready && (
        <p className="dashboard-notice">
          Save both Cost and Sales estimates to calculate projected profit.
        </p>
      )}
      <div className="dashboard-cards">
        {cards.map((c) => (
          <article key={c.title} className={`dashboard-card ${c.style}`}>
            <span className="dashboard-card-icon">
              <c.Icon size={23} />
            </span>
            <h4>{c.title}</h4>
            <dl>
              <div>
                <dt>{c.low}</dt>
                <dd>{amount(c.min, c.available)}</dd>
              </div>
              <div>
                <dt>{c.high}</dt>
                <dd>{amount(c.max, c.available)}</dd>
              </div>
            </dl>
          </article>
        ))}
      </div>
      <p className="dashboard-formula">
        Conservative = minimum sales minus maximum cost. Optimistic = maximum sales minus minimum
        cost. Negative values indicate a projected loss.
      </p>
      {open && (
        <section className="partner-planner">
          <h3>Partner investment & profit</h3>
          <p>
            Plan each partner's share. This scenario does not change partner records or payments.
          </p>
          <div className="partner-plan-controls">
            <label>
              Number of partners
              <input
                disabled={saving}
                type="number"
                min="1"
                max="100"
                value={count}
                onChange={(e) => setCount(e.target.value)}
              />
            </label>
            <button
              disabled={saving}
              onClick={() => {
                const n = Number(count);
                if (!Number.isInteger(n) || n < 1 || n > 100) {
                  setMessage("Enter 1 to 100 partners.");
                  return;
                }
                setPartners(equalPartners(n));
                setChanged(true);
                setMessage("");
              }}
            >
              <Plus size={16} />
              Apply equal shares
            </button>
            <button
              disabled={!partners.length || !valid || saving || !changed}
              onClick={() => void save()}
            >
              {saving ? "Saving..." : "Save scenario"}
            </button>
            <span className={valid ? "share-total" : "share-total invalid"}>
              Allocated: {(assigned / 100).toFixed(2)}%
            </span>
          </div>
          <p className="dashboard-formula">
            Apply equal shares replaces the current split. Adjust names and percentages below.
            Investment is your share of estimated cost; profit is your share of the projected
            result.
          </p>
          {!valid && (
            <p role="alert">
              Use shares from 0 to 100 with up to 2 decimal places. Combined shares cannot exceed
              100%.
            </p>
          )}
          {valid && assigned < 10000 && partners.length > 0 && (
            <p className="dashboard-notice">
              {((10000 - assigned) / 100).toFixed(2)}% remains unallocated.
            </p>
          )}
          {message && <p role="status">{message}</p>}
          <div className="partner-plan-cards">
            {partners.map((p, i) => (
              <article className="partner-plan-card" key={i}>
                <div className="partner-plan-inputs">
                  <label>
                    Partner {i + 1}
                    <input
                      disabled={saving}
                      aria-label={`Partner ${i + 1} name`}
                      maxLength={100}
                      value={p.name}
                      onChange={(e) => update(i, "name", e.target.value)}
                    />
                  </label>
                  <label>
                    Share %
                    <input
                      disabled={saving}
                      aria-label={`Partner ${i + 1} share`}
                      inputMode="decimal"
                      value={p.share}
                      onChange={(e) => update(i, "share", e.target.value)}
                    />
                  </label>
                </div>
                <div className="partner-plan-result">
                  <span>Investment range</span>
                  <strong>
                    {valid && total.costCount > 0
                      ? `${formatPKR(allocation(total.minCost, points[i]!))} - ${formatPKR(allocation(total.maxCost, points[i]!))}`
                      : "--"}
                  </strong>
                  <span>Projected profit / loss</span>
                  <strong className={total.minProfit < 0n ? "forecast-loss" : "forecast-profit"}>
                    {valid && ready
                      ? `${formatPKR(allocation(total.minProfit, points[i]!))} - ${formatPKR(allocation(total.maxProfit, points[i]!))}`
                      : "--"}
                  </strong>
                </div>
              </article>
            ))}
          </div>
          <p className="dashboard-formula">
            Amounts rounded to the nearest paisa; rounded shares may differ from totals by a few
            paisa. Save your scenario before leaving this tab.
          </p>
        </section>
      )}
    </div>
  );
}
