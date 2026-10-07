import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowDownLeft, ArrowUpRight, Landmark, Wallet, HardHat } from "lucide-react";
import { listBankEntries, type BankEntry } from "@/data/repositories/bankRepository";
import { accountName } from "@/domain/bankAccount";
import { formatPKR, formatPKRInLakhCrore } from "@/domain/money";
import { formatDate } from "@/lib/dates";
import { TimeSeriesChart } from "@/components/charts/TimeSeriesChart";
import "./dashboard-money.css";

const accounts = ["all", "builder", "personal", "unassigned"] as const;
const colors = ["#d88b45", "#668ac9", "#8c75bb", "#3d9d8d", "#c57885", "#84939c"];

export function summarizeMoney(entries: BankEntry[], account: string, months: number) {
  const scoped = entries.filter(
    (entry) => account === "all" || (entry.account_key || "unassigned") === account,
  );
  const dated = scoped.filter((entry) => /^\d{4}-\d{2}-\d{2}$/.test(entry.date));
  const latest = dated
    .map((entry) => entry.date.slice(0, 7))
    .sort()
    .reverse()[0];
  const [year, month] = (latest || "2000-01").split("-").map(Number);
  const keys = latest
    ? Array.from({ length: months }, (_, index) =>
        new Date(Date.UTC(year, month - months + index, 1)).toISOString().slice(0, 7),
      )
    : [];
  const rows = dated
    .filter((entry) => keys.includes(entry.date.slice(0, 7)))
    .sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
  const incoming = rows
    .filter((entry) => entry.direction === "in")
    .reduce((total, entry) => total + entry.amount, 0);
  const outgoing = rows
    .filter((entry) => entry.direction === "out")
    .reduce((total, entry) => total + entry.amount, 0);
  const categories = [
    ...new Set(rows.filter((entry) => entry.direction === "out").map((entry) => entry.category)),
  ]
    .map((label) => ({
      label,
      amount: rows
        .filter((entry) => entry.direction === "out" && entry.category === label)
        .reduce((total, entry) => total + entry.amount, 0),
    }))
    .sort((a, b) => b.amount - a.amount);
  const points = keys.map((key) => ({
    key,
    label: new Date(`${key}-01T00:00:00Z`).toLocaleDateString("en-GB", {
      month: "short",
      year: "2-digit",
      timeZone: "UTC",
    }),
    values: {
      incoming: rows
        .filter((entry) => entry.date.startsWith(key) && entry.direction === "in")
        .reduce((total, entry) => total + entry.amount, 0),
      outgoing: rows
        .filter((entry) => entry.date.startsWith(key) && entry.direction === "out")
        .reduce((total, entry) => total + entry.amount, 0),
    },
  }));
  return { rows, incoming, outgoing, categories, points, undated: scoped.length - dated.length };
}

export function DashboardMoney() {
  const [entries, setEntries] = useState<BankEntry[]>([]);
  const [account, setAccount] = useState<string>("all");
  const [months, setMonths] = useState(6);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let active = true;
    listBankEntries()
      .then((rows) => {
        if (active) {
          setEntries(rows);
          setState("ready");
        }
      })
      .catch(() => {
        if (active) setState("error");
      });
    return () => {
      active = false;
    };
  }, [reload]);
  const summary = summarizeMoney(entries, account, months);
  const period = summary.points.length
    ? `${summary.points[0].label} – ${summary.points[summary.points.length - 1].label}`
    : "No dated payments";
  return (
    <div className="money-dashboard">
      <header className="money-heading">
        <div>
          <span>
            <Landmark size={16} /> MONEY OVERVIEW
          </span>
          <h2>Follow the money behind your builds</h2>
          <p>Construction, land, partner payouts and everyday payments, together.</p>
        </div>
        <Link to="/bank">
          Open Bank <ArrowUpRight size={17} />
        </Link>
      </header>
      <div className="money-controls">
        <div role="group" aria-label="Money account">
          {accounts.map((key) => (
            <button
              type="button"
              key={key}
              aria-pressed={account === key}
              onClick={() => setAccount(key)}
            >
              {key === "all"
                ? "All accounts"
                : key === "unassigned"
                  ? "Unassigned"
                  : accountName(key)}
            </button>
          ))}
        </div>
        <label>
          Period
          <select
            aria-label="Money period"
            value={months}
            onChange={(event) => setMonths(Number(event.target.value))}
          >
            <option value={6}>Latest 6 months</option>
            <option value={12}>Latest 12 months</option>
          </select>
        </label>
      </div>
      {state === "loading" ? (
        <p role="status" className="money-empty">
          Loading money records…
        </p>
      ) : state === "error" ? (
        <div role="alert" className="money-empty">
          Money records are unavailable.{" "}
          <button
            type="button"
            onClick={() => {
              setState("loading");
              setReload((value) => value + 1);
            }}
          >
            Try again
          </button>
        </div>
      ) : (
        <>
          <p className="money-period">
            {period} · Based on the latest recorded payment in this account selection. All figures
            below use this period.
          </p>
          {summary.undated > 0 && (
            <p role="status" className="money-period">
              {summary.undated} records without a valid date are excluded. Review them in Bank.
            </p>
          )}
          <div className="money-metrics">
            {[
              {
                label: "Money received",
                amount: summary.incoming,
                note: "Contributions, repayments & recorded receipts",
                icon: ArrowDownLeft,
                tone: "in",
              },
              {
                label: "Money paid out",
                amount: summary.outgoing,
                note: "Land, construction, payouts & other payments",
                icon: ArrowUpRight,
                tone: "out",
              },
              {
                label: "Net movement",
                amount: summary.incoming - summary.outgoing,
                note: "Received less paid out · not an account balance",
                icon: Wallet,
                tone: "net",
              },
            ].map(({ label, amount, note, icon: Icon, tone }) => (
              <article className={`money-metric money-${tone}`} key={label}>
                <span>
                  <Icon size={22} />
                  {label}
                </span>
                <strong>{formatPKRInLakhCrore(amount)}</strong>
                <small>{note}</small>
              </article>
            ))}
          </div>
          <div className="money-charts">
            <section className="money-card">
              <div className="money-card-title">
                <div>
                  <h3>Money in & out</h3>
                  <p>Monthly recorded payments · PKR</p>
                </div>
                <span>{summary.rows.length} payments</span>
              </div>
              {summary.rows.length ? (
                <TimeSeriesChart
                  fillWidth
                  defaultMode="bar"
                  points={summary.points}
                  series={[
                    { key: "incoming", label: "Received", color: "#299b86" },
                    { key: "outgoing", label: "Paid out", color: "#d88b45" },
                  ]}
                  ariaLabel="Recorded money received and paid out by month"
                  caption="Net movement is not profit. Partner funding and returned capital are included as money movements."
                />
              ) : (
                <div className="money-empty">
                  <Landmark size={28} />
                  <strong>No payments in this selection</strong>
                  <p>Choose another account or add a payment in its source section.</p>
                  <Link to="/bank">View Bank records</Link>
                </div>
              )}
            </section>
            <section className="money-card">
              <div className="money-card-title">
                <div>
                  <h3>Where money went</h3>
                  <p>Share of payments made in this period</p>
                </div>
                <HardHat size={21} />
              </div>
              {summary.categories.length ? (
                <div className="money-breakdown">
                  {summary.categories.map((category, index) => (
                    <div key={category.label}>
                      <div>
                        <span>
                          <i style={{ background: colors[index % colors.length] }} />
                          {category.label}
                        </span>
                        <strong>{formatPKRInLakhCrore(category.amount)}</strong>
                      </div>
                      <div className="money-track">
                        <span
                          style={{
                            width: `${(category.amount / summary.outgoing) * 100}%`,
                            background: colors[index % colors.length],
                          }}
                        />
                      </div>
                      <small>
                        {((category.amount / summary.outgoing) * 100).toFixed(1)}% of money paid out
                      </small>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="money-empty">No outgoing payments recorded.</div>
              )}
            </section>
          </div>
          <section className="money-card">
            <div className="money-card-title">
              <div>
                <h3>Latest payments</h3>
                <p>The six most recent payments in this selection</p>
              </div>
              <Link to="/bank">
                All transactions <ArrowUpRight size={16} />
              </Link>
            </div>
            <div className="money-payment-list">
              {summary.rows.slice(0, 6).map((entry) => (
                <Link
                  key={entry.id}
                  to={
                    entry.source === "personal_deposits" || entry.source === "deposit_returns"
                      ? "/personal-deposit" : entry.project_id
                      ? `/projects/${entry.project_id}`
                      : entry.source === "personal_expenses"
                        ? "/personal-expense"
                        : entry.source === "land"
                          ? "/land"
                          : entry.source.startsWith("udhaar")
                            ? "/credit-udhaar"
                            : "/bank"
                  }
                >
                  <span className={`money-payment-icon money-${entry.direction}`}>
                    {entry.direction === "in" ? (
                      <ArrowDownLeft size={19} />
                    ) : (
                      <ArrowUpRight size={19} />
                    )}
                  </span>
                  <span>
                    <strong>{entry.description || entry.person || entry.category}</strong>
                    <small>
                      {entry.category} · {entry.project || accountName(entry.account_key)}
                    </small>
                  </span>
                  <time dateTime={entry.date}>{formatDate(entry.date)}</time>
                  <b>
                    {entry.direction === "in" ? "+" : "−"}
                    {formatPKR(entry.amount)}
                  </b>
                </Link>
              ))}
              {!summary.rows.length && (
                <p className="money-empty">Your latest payments will appear here.</p>
              )}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
