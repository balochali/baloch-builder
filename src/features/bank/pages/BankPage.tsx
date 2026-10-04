import "./bank-page.css";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  ChevronDown,
  Landmark,
  List,
  Images,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useRecordFilters } from "@/components/RecordFilters";
import { TimeSeriesChart, chartColors } from "@/components/charts/TimeSeriesChart";
import { accountName, type BankAccount } from "@/domain/bankAccount";
import { formatPKR, formatPKRInLakhCrore } from "@/domain/money";
import { formatDate } from "@/lib/dates";
import {
  listBankEntries,
  assignBankAccount,
  type BankEntry,
} from "@/data/repositories/bankRepository";
import { LandPaymentDetailsSchema } from "@/data/repositories/projectStageRepository";
import { listLandPaymentReceipts, type DocumentRecord } from "@/data/repositories/documentsRepository";
import { SavedImageGallery } from "@/features/documents/components/ImageGallery";

type View = "overview" | "accounts" | "transactions" | "images";
const views: { key: View; label: string; icon: typeof BarChart3 }[] = [
  { key: "overview", label: "Overview", icon: BarChart3 },
  { key: "accounts", label: "Accounts", icon: Landmark },
  { key: "transactions", label: "Transactions", icon: List },
  { key: "images", label: "Images", icon: Images },
];
const accountOptions = [
  { key: "all", label: "All accounts" },
  { key: "personal", label: "Personal" },
  { key: "builder", label: "Builder" },
  { key: "unassigned", label: "Unassigned" },
] as const;
function totalsOf(rows: BankEntry[]) {
  return rows.reduce(
    (totals, row) => {
      totals[row.direction === "in" ? "incoming" : "outgoing"] += row.amount;
      return totals;
    },
    { incoming: 0, outgoing: 0 },
  );
}
function sourceLink(row: BankEntry) {
  if (row.project_id) return `/projects/${row.project_id}`;
  if (row.source === "personal_expenses") return "/personal-expense";
  if (row.source === "land") return "/land";
  return "/credit-udhaar";
}

function LandPaymentInfo({ raw }: { raw: string }) {
  let details;
  try {
    const parsed = LandPaymentDetailsSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) return null;
    details = parsed.data;
  } catch {
    return null;
  }
  const facts = [
    ["Paid to", details.paid_to],
    [
      details.method === "digital"
        ? "Wallet / app"
        : details.method === "other"
          ? "Payment service"
          : "Bank",
      details.provider,
    ],
    ["Account holder", details.account_name],
    [details.method === "digital" ? "Wallet / mobile" : "Account number", details.account_no],
    [details.method === "cheque" ? "Cheque number" : "Reference", details.reference],
    ["Cheque date", details.cheque_date ? formatDate(details.cheque_date) : ""],
  ].filter(([, value]) => Boolean(value));
  return (
    <details className="bank-payment-details">
      <summary>
        Payment details <ChevronDown size={14} />
      </summary>
      <dl>
        {facts.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}

export function BankPage() {
  const [entries, setEntries] = useState<BankEntry[]>([]);
  const [receipts, setReceipts] = useState<DocumentRecord[]>([]);
  const [imageSearch, setImageSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState<string | null>(null);
  const [account, setAccount] = useState("all");
  const [view, setView] = useState<View>("overview");
  async function refresh() {
    setLoading(true);
    setError("");
    try {
      setEntries(await listBankEntries());
      setReceipts(await listLandPaymentReceipts());
    } catch {
      setError("Could not load accounts. Restart the updated desktop app, then refresh.");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    let active = true;
    listBankEntries()
      .then((rows) => {
        if (active) setEntries(rows);
      })
      .catch(() => {
        if (active)
          setError("Could not load accounts. Restart the updated desktop app, then refresh.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    let active = true;
    listLandPaymentReceipts()
      .then((rows) => { if (active) setReceipts(rows); })
      .catch(() => { if (active) setReceipts([]); });
    return () => { active = false; };
  }, []);
  const scoped = entries.filter(
    (row) => account === "all" || (row.account_key ?? "unassigned") === account,
  );
  const landEntries = new Map(scoped.filter((row) => row.source === "land").map((row) => [row.source_id, row]));
  const visibleReceipts = receipts.filter((receipt) =>
    receipt.owner_id && landEntries.has(receipt.owner_id) &&
    [receipt.title, receipt.project_name, receipt.notes].join(" ").toLowerCase().includes(imageSearch.trim().toLowerCase()),
  );
  const { visible, controls, search, setSearch, active, reset } = useRecordFilters(scoped, {
    label: "bank transactions",
    showSearch: false,
    searchText: (row) =>
      [row.person, row.description, row.project, row.category, row.method].join(" "),
    date: (row) => row.date,
    amount: (row) => row.amount,
    facets: [
      { label: "Direction", value: (row) => (row.direction === "in" ? "Money in" : "Money out") },
      { label: "Category", value: (row) => row.category },
      { label: "Project", value: (row) => row.project || "No project" },
      { label: "Method", value: (row) => row.method },
    ],
  });
  async function changeAccount(row: BankEntry, value: BankAccount) {
    setSaving(row.id);
    setError("");
    try {
      await assignBankAccount(row, value);
      setEntries(await listBankEntries());
    } catch {
      setError(
        "Could not update the account. Refresh to check the latest saved data, then try again.",
      );
    } finally {
      setSaving(null);
    }
  }
  const totals = totalsOf(scoped);
  const filteredTotals = totalsOf(visible);
  const unassignedCount = entries.filter((row) => !row.account_key).length;
  const byMonth = new Map<string, { incoming: number; outgoing: number }>();
  scoped.forEach((row) => {
    const key = row.date.slice(0, 7);
    const month = byMonth.get(key) ?? { incoming: 0, outgoing: 0 };
    month[row.direction === "in" ? "incoming" : "outgoing"] += row.amount;
    byMonth.set(key, month);
  });
  const flow = [...byMonth]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, values]) => ({
      key: `${key}-01`,
      label: key,
      values,
    }));
  const outgoingSources = [
    ...scoped
      .filter((row) => row.direction === "out")
      .reduce((map, row) => {
        map.set(row.category, (map.get(row.category) ?? 0) + row.amount);
        return map;
      }, new Map<string, number>()),
  ].sort((a, b) => b[1] - a[1]);
  const maxSource = outgoingSources[0]?.[1] ?? 0;

  return (
    <main className="bank-page">
      <header className="bank-heading">
        <div>
          <p className="bank-eyebrow">
            <Landmark size={16} /> YOUR MONEY MOVEMENT
          </p>
          <h1>Bank & accounts</h1>
          <p>Follow money coming in and going out across your personal and builder accounts.</p>
        </div>
        <Button onClick={refresh} disabled={loading || !!saving} variant="secondary">
          <RefreshCw size={16} /> Refresh
        </Button>
      </header>
      <div className="bank-tabs" role="tablist" aria-label="Bank views">
        {views.map(({ key, label, icon: Icon }, index) => (
          <button
            key={key}
            type="button"
            role="tab"
            id={`bank-tab-${key}`}
            aria-selected={view === key}
            aria-controls={`bank-panel-${key}`}
            tabIndex={view === key ? 0 : -1}
            onClick={() => setView(key)}
            onKeyDown={(event) => {
              const next =
                event.key === "ArrowRight"
                  ? (index + 1) % views.length
                  : event.key === "ArrowLeft"
                    ? (index + views.length - 1) % views.length
                    : event.key === "Home"
                      ? 0
                      : event.key === "End"
                        ? views.length - 1
                        : -1;
              if (next >= 0) {
                event.preventDefault();
                setView(views[next].key);
                document.getElementById(`bank-tab-${views[next].key}`)?.focus();
              }
            }}
          >
            <Icon size={19} /> {label} {key === "transactions" && <span>{entries.length}</span>}
          </button>
        ))}
      </div>
      {error && (
        <p role="alert" className="bank-error">
          {error}
        </p>
      )}
      {loading ? (
        <p className="bank-loading">Loading bank transactions…</p>
      ) : (
        <>
          <div className="bank-account-switch" role="group" aria-label="Account view">
            {accountOptions.map((option) => (
              <button
                type="button"
                key={option.key}
                aria-pressed={account === option.key}
                onClick={() => setAccount(option.key)}
              >
                {option.label}
                {option.key === "unassigned" && unassignedCount > 0 && (
                  <span>{unassignedCount}</span>
                )}
              </button>
            ))}
          </div>
          {view === "overview" && (
            <section
              id="bank-panel-overview"
              role="tabpanel"
              aria-labelledby="bank-tab-overview"
              className="bank-panel"
            >
              <div className="bank-summary">
                <div className="bank-stat is-net">
                  <span className="bank-stat-icon">
                    <Wallet size={24} />
                  </span>
                  <span>Net recorded movement</span>
                  <strong>{formatPKRInLakhCrore(totals.incoming - totals.outgoing)}</strong>
                  <small>Money in minus money out · all recorded dates</small>
                </div>
                <div className="bank-stat is-in">
                  <span className="bank-stat-icon">
                    <ArrowDownLeft size={24} />
                  </span>
                  <span>Money in</span>
                  <strong>{formatPKRInLakhCrore(totals.incoming)}</strong>
                  <small>
                    {scoped.filter((row) => row.direction === "in").length} incoming records
                  </small>
                </div>
                <div className="bank-stat is-out">
                  <span className="bank-stat-icon">
                    <ArrowUpRight size={24} />
                  </span>
                  <span>Money out</span>
                  <strong>{formatPKRInLakhCrore(totals.outgoing)}</strong>
                  <small>
                    {scoped.filter((row) => row.direction === "out").length} outgoing records
                  </small>
                </div>
              </div>
              <p className="bank-scope-note">
                Recorded movement is not a live bank balance. No opening balance is assumed;
                estimates and promised contributions are excluded.
              </p>
              <div className="bank-visuals">
                <section className="bank-chart-card">
                  <div className="bank-section-heading">
                    <span className="bank-heading-icon is-purple">
                      <BarChart3 size={22} />
                    </span>
                    <div>
                      <h2>Money flow over time</h2>
                      <p>Monthly incoming and outgoing payments</p>
                    </div>
                  </div>
                  {flow.length ? (
                    <TimeSeriesChart
                      points={flow}
                      series={[
                        { key: "incoming", label: "Money in", color: chartColors.green },
                        { key: "outgoing", label: "Money out", color: chartColors.coral },
                      ]}
                      defaultMode="bar"
                      fillWidth
                      ariaLabel="Monthly money in and money out"
                    />
                  ) : (
                    <p className="bank-empty-visual">
                      Recorded payments will appear here as a chart.
                    </p>
                  )}
                </section>
                <section className="bank-chart-card">
                  <div className="bank-section-heading">
                    <span className="bank-heading-icon is-orange">
                      <ArrowUpRight size={22} />
                    </span>
                    <div>
                      <h2>Where money went</h2>
                      <p>Outgoing payments by source</p>
                    </div>
                  </div>
                  {outgoingSources.length ? (
                    <div className="bank-source-list">
                      {outgoingSources.map(([name, amount], index) => (
                        <div className="bank-source" key={name}>
                          <div>
                            <span
                              className="bank-source-dot"
                              style={{
                                backgroundColor: [
                                  "#f59e0b",
                                  "#7c3aed",
                                  "#3b82f6",
                                  "#e11d48",
                                  "#059669",
                                ][index % 5],
                              }}
                            />
                            <strong>{name}</strong>
                            <span>{formatPKRInLakhCrore(amount)}</span>
                          </div>
                          <div className="bank-source-track">
                            <span
                              style={{
                                width: `${maxSource ? (amount / maxSource) * 100 : 0}%`,
                                backgroundColor: [
                                  "#f59e0b",
                                  "#7c3aed",
                                  "#3b82f6",
                                  "#e11d48",
                                  "#059669",
                                ][index % 5],
                              }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="bank-empty-visual">
                      Outgoing payments will appear here by source.
                    </p>
                  )}
                </section>
              </div>
              <button
                type="button"
                className="bank-view-all"
                onClick={() => setView("transactions")}
              >
                Explore all transactions <ArrowRight size={17} />
              </button>
            </section>
          )}
          {view === "accounts" && (
            <section
              id="bank-panel-accounts"
              role="tabpanel"
              aria-labelledby="bank-tab-accounts"
              className="bank-panel"
            >
              <div className="bank-section-title">
                <div>
                  <h2>Account picture</h2>
                  <p>Compare recorded money movement for each account.</p>
                </div>
              </div>
              <div className="bank-account-cards">
                {(["personal", "builder"] as const).map((key) => {
                  const rows = entries.filter((row) => row.account_key === key);
                  const summary = totalsOf(rows);
                  return (
                    <article key={key} className={`bank-account-card is-${key}`}>
                      <div className="bank-account-card-top">
                        <span>
                          <Landmark size={24} />
                        </span>
                        <span>{rows.length} records</span>
                      </div>
                      <h3>{accountName(key)}</h3>
                      <p>Net recorded movement</p>
                      <strong>{formatPKRInLakhCrore(summary.incoming - summary.outgoing)}</strong>
                      <div className="bank-account-split">
                        <span>
                          <ArrowDownLeft size={17} /> Money in <b>{formatPKR(summary.incoming)}</b>
                        </span>
                        <span>
                          <ArrowUpRight size={17} /> Money out <b>{formatPKR(summary.outgoing)}</b>
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setAccount(key);
                          setView("transactions");
                        }}
                      >
                        See transactions <ArrowRight size={16} />
                      </button>
                    </article>
                  );
                })}
              </div>
              {unassignedCount > 0 && (
                <div className="bank-unassigned">
                  <div>
                    <strong>
                      {unassignedCount} older{" "}
                      {unassignedCount === 1 ? "transaction needs" : "transactions need"} an account
                    </strong>
                    <p>
                      Assign each record to Personal or Builder so the account picture is complete.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setAccount("unassigned");
                      setView("transactions");
                    }}
                  >
                    Review unassigned <ArrowRight size={16} />
                  </button>
                </div>
              )}
              <p className="bank-scope-note">
                Account totals reflect saved activity, not a live bank balance. Land acquisition
                uses its recorded purchase price.
              </p>
            </section>
          )}
          {view === "transactions" && (
            <section
              id="bank-panel-transactions"
              role="tabpanel"
              aria-labelledby="bank-tab-transactions"
              className="bank-panel"
            >
              <div className="bank-section-title">
                <div>
                  <h2>Transaction history</h2>
                  <p>
                    Search payments, review their source, and assign older records to an account.
                  </p>
                </div>
                <span>
                  {visible.length} of {scoped.length} shown
                </span>
              </div>
              {unassignedCount > 0 && (
                <div className="bank-unassigned">
                  <div>
                    <strong>
                      {unassignedCount} older{" "}
                      {unassignedCount === 1 ? "transaction has" : "transactions have"} no account
                    </strong>
                    <p>Choose Unassigned above to review and assign each payment.</p>
                  </div>
                </div>
              )}
              <div className="bank-search-box">
                <Search size={19} />
                <input
                  aria-label="Search bank transactions"
                  placeholder="Search people, projects, categories or payment methods…"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </div>
              <details className="bank-filter-drawer">
                <summary>
                  <span>
                    <SlidersHorizontal size={18} /> More filters
                  </span>
                  <span>
                    {active ? "Filters applied" : "Date, amount, source & method"}{" "}
                    <ChevronDown size={16} />
                  </span>
                </summary>
                {controls}
              </details>
              {active && (
                <div className="bank-filter-active">
                  <span>{visible.length} transactions match your filters.</span>
                  <Button variant="ghost" size="sm" onClick={reset}>
                    Clear filters
                  </Button>
                </div>
              )}
              <div className="bank-filter-totals">
                <span>
                  <ArrowDownLeft size={16} /> Received{" "}
                  <strong>{formatPKR(filteredTotals.incoming)}</strong>
                </span>
                <span>
                  <ArrowUpRight size={16} /> Sent{" "}
                  <strong>{formatPKR(filteredTotals.outgoing)}</strong>
                </span>
                <span>
                  <Wallet size={16} /> Net{" "}
                  <strong>{formatPKR(filteredTotals.incoming - filteredTotals.outgoing)}</strong>
                </span>
              </div>
              <div className="bank-table-wrap">
                <table>
                  <thead>
                    <tr>
                      {[
                        "Date",
                        "Person / description",
                        "Source",
                        "Money in",
                        "Money out",
                        "Account",
                      ].map((title) => (
                        <th key={title}>{title}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((row) => (
                      <tr key={row.id + row.account_key}>
                        <td>{formatDate(row.date)}</td>
                        <td>
                          <strong>{row.person || row.description}</strong>
                          {row.person && <p>{row.description}</p>}
                          <small>{row.method}</small>
                        </td>
                        <td>
                          <Link to={sourceLink(row)}>
                            {row.category} <ArrowRight size={13} />
                          </Link>
                          <p>{row.project}</p>
                          {row.source === "land" && row.payment_details && (
                            <LandPaymentInfo raw={row.payment_details} />
                          )}
                          {row.source === "land" && (
                            <SavedImageGallery documents={receipts.filter((receipt) => receipt.owner_id === row.source_id)} />
                          )}
                        </td>
                        <td className="money-in">
                          {row.direction === "in" ? formatPKR(row.amount) : "—"}
                        </td>
                        <td className="money-out">
                          {row.direction === "out" ? formatPKR(row.amount) : "—"}
                        </td>
                        <td>
                          <select
                            aria-label={`Account for ${row.person || row.description} on ${row.date}`}
                            value={row.account_key ?? ""}
                            disabled={!!saving}
                            onChange={(event) =>
                              void changeAccount(row, event.target.value as BankAccount)
                            }
                          >
                            <option value="" disabled>
                              Unassigned
                            </option>
                            <option value="personal">Personal Account</option>
                            <option value="builder">Builder Account</option>
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!visible.length && (
                  <p className="bank-empty-visual">No transactions match these filters.</p>
                )}
              </div>
            </section>
          )}
          {view === "images" && (
            <section id="bank-panel-images" role="tabpanel" aria-labelledby="bank-tab-images" className="bank-panel">
              <div className="bank-section-title"><div><h2>Payment images</h2><p>Receipts, cheque photos and payment proof saved with land purchases.</p></div><span>{visibleReceipts.length} images</span></div>
              <div className="bank-search-box"><Search size={19} /><input aria-label="Search payment images" placeholder="Search images or projects…" value={imageSearch} onChange={(event) => setImageSearch(event.target.value)} /></div>
              {visibleReceipts.length ? (
                <div className="bank-images-grid">
                  {visibleReceipts.map((receipt) => {
                    const entry = landEntries.get(receipt.owner_id || "");
                    return <article key={receipt.id} className="bank-image-card">
                      <div className="bank-image-card-icon"><Images size={23} /></div>
                      <strong>{receipt.title}</strong>
                      <span>{receipt.project_name || "Land purchase"} · {entry ? formatDate(entry.date) : ""}</span>
                      <small>{receipt.notes === "bank" ? "Bank transfer" : receipt.notes === "cheque" ? "Cheque" : receipt.notes === "cash" ? "Cash" : receipt.notes === "digital" ? "Digital payment" : "Payment proof"}</small>
                      <SavedImageGallery documents={[receipt]} />
                      {entry?.project_id && <Link to={`/projects/${entry.project_id}`}>Open project <ArrowRight size={14} /></Link>}
                    </article>;
                  })}
                </div>
              ) : <p className="bank-empty-visual">No payment images match this account or search.</p>}
            </section>
          )}
        </>
      )}
    </main>
  );
}
