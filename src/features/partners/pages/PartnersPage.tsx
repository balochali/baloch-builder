import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  ArrowUpRight,
  ChartNoAxesColumn,
  ChevronDown,
  HandCoins,
  Landmark,
  PieChart,
  Plus,
  Search,
  SlidersHorizontal,
  UserRound,
  Users,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/EmptyState";
import { TimeSeriesChart, chartColors } from "@/components/charts/TimeSeriesChart";
import { useRecordFilters } from "@/components/RecordFilters";
import {
  addPartnerContribution,
  listAllPartnerContributions,
  listAllProjectPartners,
  type PartnerContributionInput,
  type PartnerOverviewRow,
} from "@/data/repositories/projectPartnersRepository";
import type { Transaction } from "@/domain/types";
import { formatPKR, formatPKRInLakhCrore } from "@/domain/money";
import { formatDate } from "@/lib/dates";
import "./partners-page.css";
import { ProjectPartnerDialog } from "@/features/projects/components/ProjectPartnerDialog";
import { PaymentDetailsView } from "@/features/partners/components/PaymentDetailsView";

export function PartnersPage() {
  const [partners, setPartners] = useState<PartnerOverviewRow[]>([]);
  const [contributions, setContributions] = useState<Transaction[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedPartner, setSelectedPartner] = useState<PartnerOverviewRow | null>(null);
  const [view, setView] = useState<"overview" | "profiles" | "history">("overview");

  useEffect(() => {
    let active = true;
    Promise.all([listAllProjectPartners(), listAllPartnerContributions()])
      .then(([partnerRows, paymentRows]) => {
        if (!active) return;
        setPartners(partnerRows);
        setContributions(paymentRows);
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

  const { visible, pageItems, pagination, controls, search, setSearch, active, reset } = useRecordFilters(partners, {
    label: "partners",
    showSearch: false,
    searchText: (partner) =>
      [
        partner.name,
        partner.phone,
        partner.phone2,
        partner.project_name,
        partner.project_code,
        partner.project_location,
        partner.notes,
      ]
        .filter(Boolean)
        .join(" "),
    date: (partner) => partner.created_at,
    dateLabel: "Joined",
    amount: (partner) => partner.contributed,
    facets: [
      { label: "Project", value: (partner) => partner.project_name },
      {
        label: "Funding status",
        value: (partner) =>
          partner.agreed_contribution === null
            ? "No target set"
            : partner.contributed >= partner.agreed_contribution
              ? "Fully funded"
              : "Balance remaining",
      },
    ],
  });

  const matchingPayments = contributions.filter((item) =>
    visible.some(
      (partner) => partner.project_id === item.project_id && partner.partner_id === item.partner_id,
    ),
  );
  const paymentFilter = useRecordFilters(matchingPayments, {
    label: "contributions",
    searchText: (item) =>
      [
        partners.find((partner) => partner.partner_id === item.partner_id)?.name,
        item.description,
        item.reference,
      ]
        .filter(Boolean)
        .join(" "),
    date: (item) => item.date,
    amount: (item) => item.amount,
    facets: [{ label: "Payment method", value: (item) => item.method }],
  });

  async function recordContribution(value: PartnerContributionInput) {
    await addPartnerContribution(value);
    toast.success("Partner contribution recorded");
    try {
      const [partnerRows, paymentRows] = await Promise.all([
        listAllProjectPartners(),
        listAllPartnerContributions(),
      ]);
      setPartners(partnerRows);
      setContributions(paymentRows);
    } catch {
      toast.error("Payment saved. Refresh the page to see the latest details.");
    }
  }

  const totalReceived = contributions.reduce((total, item) => total + item.amount, 0);
  const totalAgreed = partners.reduce(
    (total, partner) => total + (partner.agreed_contribution ?? 0),
    0,
  );
  const totalRemaining = partners.reduce(
    (total, partner) =>
      total + Math.max(0, (partner.agreed_contribution ?? 0) - partner.contributed),
    0,
  );
  const projectTotals = [
    ...partners.reduce((map, partner) => {
      const row = map.get(partner.project_id) ?? {
        name: partner.project_name,
        agreed: 0,
        received: 0,
        count: 0,
      };
      row.agreed += partner.agreed_contribution ?? 0;
      row.received += partner.contributed;
      row.count += 1;
      map.set(partner.project_id, row);
      return map;
    }, new Map<string, { name: string; agreed: number; received: number; count: number }>()),
  ].sort((a, b) => b[1].received - a[1].received);
  const monthlyPayments = [
    ...contributions.reduce((map, payment) => {
      const key = payment.date.slice(0, 7);
      map.set(key, (map.get(key) ?? 0) + payment.amount);
      return map;
    }, new Map<string, number>()),
  ]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, received]) => ({ key: `${key}-01`, values: { received } }));

  return (
    <main className="partners-page">
      <header className="partners-heading">
        <div>
          <p className="partners-eyebrow">
            <Users size={16} /> PEOPLE BEHIND YOUR PROJECTS
          </p>
          <h1>Partners</h1>
          <p>See ownership, promised funding and every contribution in one place.</p>
        </div>
      </header>
      {loading && <p className="py-8 text-sm text-muted-foreground">Loading partners…</p>}
      {!loading && error && (
        <p role="alert" className="py-8 text-sm text-destructive">
          Could not load partners: {error}
        </p>
      )}
      {!loading && !error && (
        <>
          <div className="partners-tabs" role="tablist" aria-label="Partner views">
            {(
              [
                ["overview", "Overview", ChartNoAxesColumn],
                ["profiles", "Partner profiles", Users],
                ["history", "Contributions", HandCoins],
              ] as const
            ).map(([key, label, Icon], index) => (
              <button
                type="button"
                role="tab"
                key={key}
                id={`partners-tab-${key}`}
                aria-selected={view === key}
                aria-controls={`partners-panel-${key}`}
                tabIndex={view === key ? 0 : -1}
                onClick={() => setView(key)}
                onKeyDown={(event) => {
                  const next =
                    event.key === "ArrowRight"
                      ? (index + 1) % 3
                      : event.key === "ArrowLeft"
                        ? (index + 2) % 3
                        : event.key === "Home"
                          ? 0
                          : event.key === "End"
                            ? 2
                            : -1;
                  if (next >= 0) {
                    event.preventDefault();
                    const target = (["overview", "profiles", "history"] as const)[next];
                    setView(target);
                    document.getElementById(`partners-tab-${target}`)?.focus();
                  }
                }}
              >
                <Icon size={19} />
                {label}
              </button>
            ))}
          </div>
          {view === "overview" && (
            <section
              className="partners-panel"
              id="partners-panel-overview"
              role="tabpanel"
              aria-labelledby="partners-tab-overview"
            >
              <div className="partners-metrics">
                <Summary
                  icon={Users}
                  color="purple"
                  label="Partners"
                  value={String(new Set(partners.map((partner) => partner.partner_id)).size)}
                  note="People linked to projects"
                />
                <Summary
                  icon={PieChart}
                  color="blue"
                  label="Project partnerships"
                  value={String(partners.length)}
                  note="Shares across your projects"
                />
                <Summary
                  icon={HandCoins}
                  color="green"
                  label="Money received"
                  value={formatPKRInLakhCrore(totalReceived)}
                  note="Recorded contributions"
                />
                <Summary
                  icon={Wallet}
                  color="orange"
                  label="Still to receive"
                  value={formatPKRInLakhCrore(totalRemaining)}
                  note={totalAgreed ? "Against agreed amounts" : "No contribution targets set"}
                />
              </div>
              <div className="partners-overview-grid">
                <section className="partners-visual">
                  <div className="partners-visual-heading">
                    <span className="is-purple">
                      <ChartNoAxesColumn size={23} />
                    </span>
                    <div>
                      <h2>Contributions over time</h2>
                      <p>Money received from partners by month</p>
                    </div>
                  </div>
                  {monthlyPayments.length ? (
                    <TimeSeriesChart
                      points={monthlyPayments}
                      series={[{ key: "received", label: "Received", color: chartColors.purple }]}
                      defaultMode="bar"
                      fillWidth
                      ariaLabel="Monthly partner contributions"
                    />
                  ) : (
                    <p className="partners-empty-chart">Recorded contributions will appear here.</p>
                  )}
                </section>
                <section className="partners-visual">
                  <div className="partners-visual-heading">
                    <span className="is-green">
                      <Landmark size={23} />
                    </span>
                    <div>
                      <h2>Funding by project</h2>
                      <p>Received against agreed contributions</p>
                    </div>
                  </div>
                  {projectTotals.length ? (
                    <div className="partners-project-bars">
                      {projectTotals.map(([id, project]) => (
                        <div key={id} className="partners-project-bar">
                          <div>
                            <strong>{project.name}</strong>
                            <span>{formatPKRInLakhCrore(project.received)} received</span>
                          </div>
                          <div className="partners-project-track">
                            <span
                              style={{
                                width: `${project.agreed ? Math.min(100, (project.received / project.agreed) * 100) : 0}%`,
                              }}
                            />
                          </div>
                          <small>
                            {project.agreed
                              ? `${Math.round(Math.min(100, (project.received / project.agreed) * 100))}% of ${formatPKRInLakhCrore(project.agreed)} agreed`
                              : "No contribution target set"}
                          </small>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="partners-empty-chart">Projects with partners will appear here.</p>
                  )}
                </section>
              </div>
              <button
                className="partners-view-profiles"
                type="button"
                onClick={() => setView("profiles")}
              >
                Explore partner profiles <ArrowRight size={17} />
              </button>
            </section>
          )}
          {view === "profiles" && (
            <section
              className="partners-panel"
              id="partners-panel-profiles"
              role="tabpanel"
              aria-labelledby="partners-tab-profiles"
            >
              <div className="partners-section-title">
                <div>
                  <h2>Partner profiles</h2>
                  <p>Open a project or record a contribution for someone.</p>
                </div>
                <span>
                  {visible.length} of {partners.length} shown
                </span>
              </div>
              <div className="partners-search">
                <Search size={19} />
                <input
                  aria-label="Search partners"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search partners, projects or phone numbers…"
                />
              </div>
              <details className="partners-filter-drawer">
                <summary>
                  <span>
                    <SlidersHorizontal size={18} /> More filters
                  </span>
                  <span>
                    {active ? "Filters applied" : "Project, funding, dates & amount"}
                    <ChevronDown size={16} />
                  </span>
                </summary>
                {controls}
              </details>{pagination}
              {active && (
                <div className="partners-active-filter">
                  <span>{visible.length} partners match your filters.</span>
                  <Button variant="ghost" size="sm" onClick={reset}>
                    Clear filters
                  </Button>
                </div>
              )}
              <p className="partners-scope-note">
                Profile filters also select whose contributions appear in the history tab.
              </p>
              {partners.length === 0 ? (
                <EmptyState
                  icon={<Users className="size-10 text-muted-foreground" />}
                  title="No partners yet"
                  description="Open a project and use Add Partner to register its investors."
                />
              ) : visible.length === 0 ? (
                <p className="rounded-lg border p-8 text-center text-sm text-muted-foreground">
                  No partners match your search.
                </p>
              ) : (
                <div className="partners-cards">
                  {pageItems.map((partner) => {
                    const payments = contributions.filter(
                      (item) =>
                        item.project_id === partner.project_id &&
                        item.partner_id === partner.partner_id,
                    );
                    const remaining =
                      partner.agreed_contribution === null
                        ? null
                        : Math.max(0, partner.agreed_contribution - partner.contributed);
                    const progress =
                      partner.agreed_contribution && partner.agreed_contribution > 0
                        ? Math.min(100, (partner.contributed / partner.agreed_contribution) * 100)
                        : partner.agreed_contribution === 0
                          ? 100
                          : 0;
                    const status =
                      partner.agreed_contribution === null
                        ? "no-target"
                        : remaining === 0
                          ? "settled"
                          : partner.contributed > 0
                            ? "partial"
                            : "unpaid";
                    return (
                      <section
                        key={partner.partnership_id}
                        className={`partners-card is-${status}`}
                      >
                        <div className="partners-card-top">
                          <span className="partners-avatar">
                            <UserRound size={25} />
                          </span>
                          <div className="partners-person">
                            <h2 className="text-lg font-semibold">{partner.name}</h2>
                            <p className="text-sm text-muted-foreground">
                              {partner.phone || "No mobile number"}
                              {partner.phone2 ? ` · ${partner.phone2}` : ""}
                            </p>
                          </div>
                          <span className="partners-share">
                            {(partner.share_bp / 100).toFixed(2)}% share
                          </span>
                        </div>
                        <div className="partners-card-status">
                          {status === "settled"
                            ? "Contribution received"
                            : status === "partial"
                              ? "Partly received"
                              : status === "no-target"
                                ? "No amount agreed"
                                : "Awaiting payment"}
                        </div>
                        <div className="partners-card-balance">
                          <small>
                            {remaining === null ? "Received so far" : "Still to receive"}
                          </small>
                          <strong>{formatPKRInLakhCrore(remaining ?? partner.contributed)}</strong>
                        </div>
                        {remaining !== null && (
                          <>
                            <div className="partners-progress-caption">
                              <span>Contribution progress</span>
                              <strong>{Math.round(progress)}% received</strong>
                            </div>
                            <div
                              className="partners-progress"
                              role="img"
                              aria-label={`${partner.name}: ${formatPKR(partner.contributed)} received, ${formatPKR(remaining)} remaining`}
                            >
                              <span style={{ width: `${progress}%` }} />
                            </div>
                          </>
                        )}
                        <div className="partners-card-split">
                          <span>
                            Agreed{" "}
                            <strong>
                              {partner.agreed_contribution === null
                                ? "Not set"
                                : formatPKR(partner.agreed_contribution)}
                            </strong>
                          </span>
                          <span>
                            Received <strong>{formatPKR(partner.contributed)}</strong>
                          </span>
                        </div>
                        <div className="partners-card-project">
                          <p className="text-xs text-muted-foreground">Project</p>
                          <Link
                            to={`/projects/${partner.project_id}`}
                            className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
                          >
                            {partner.project_name}
                            {partner.project_code ? ` · ${partner.project_code}` : ""}
                            <ArrowUpRight className="size-4" />
                          </Link>
                          <p className="text-xs text-muted-foreground">
                            {partner.project_location || "No project address"}
                            {partner.project_status ? ` · ${partner.project_status}` : ""}
                          </p>
                        </div>
                        <div className="partners-card-facts">
                          <Fact label="Address" value={partner.address} />
                          <Fact
                            label="Partner status"
                            value={partner.partner_status || partner.partnership_status}
                          />
                          <Fact label="Partner since" value={formatDate(partner.created_at)} />
                        </div>
                        {partner.notes && (
                          <div className="mt-3 text-sm">
                            <Fact label="Notes" value={partner.notes} />
                          </div>
                        )}
                        <div className="partners-card-footer">
                          <p className="text-sm font-medium">Payments ({payments.length})</p>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setSelectedPartner(partner)}
                          >
                            <Plus className="size-4" />
                            Record Contribution
                          </Button>
                        </div>
                        {payments.length === 0 && (
                          <p className="mt-3 text-sm text-muted-foreground">
                            No contributions recorded yet.
                          </p>
                        )}
                      </section>
                    );
                  })}
                </div>
              )}
            </section>
          )}
          {view === "history" && (
            <section
              className="partners-panel"
              id="partners-panel-history"
              role="tabpanel"
              aria-labelledby="partners-tab-history"
              aria-label="Contribution history"
            >
              <div className="partners-section-title">
                <div>
                  <h2>Contribution history</h2>
                  <p>Payments from the partner profiles matching your filters.</p>
                </div>
                <span>{paymentFilter.visible.length} payments</span>
              </div>
              <details className="partners-filter-drawer">
                <summary>
                  <span>
                    <SlidersHorizontal size={18} /> Search & filter contributions
                  </span>
                  <span>
                    {paymentFilter.active ? "Filters applied" : "All contributions"}
                    <ChevronDown size={16} />
                  </span>
                </summary>
                {paymentFilter.controls}
              </details>{paymentFilter.pagination}
              {paymentFilter.active && (
                <div className="partners-active-filter">
                  <span>{paymentFilter.visible.length} payments match your filters.</span>
                  <Button variant="ghost" size="sm" onClick={paymentFilter.reset}>
                    Clear filters
                  </Button>
                </div>
              )}
              {paymentFilter.visible.length === 0 ? (
                <p className="filter-empty">No contributions match these filters.</p>
              ) : (
                <div className="partners-payment-list">
                  {paymentFilter.pageItems.map((payment) => {
                    const partner = partners.find(
                      (item) =>
                        item.partner_id === payment.partner_id &&
                        item.project_id === payment.project_id,
                    );
                    return (
                      <article key={payment.id} className="partners-payment">
                        <div className="flex flex-wrap justify-between gap-3">
                          <div>
                            <strong>{partner?.name || "Partner"}</strong>
                            <span className="text-sm text-muted-foreground">
                              {" "}
                              · {partner?.project_name || "Project"}
                            </span>
                            <p>
                              {formatDate(payment.date)} · {payment.method || "Other"}
                            </p>
                          </div>
                          <strong>{formatPKR(payment.amount)}</strong>
                        </div>
                        <p>
                          {payment.description || "Contribution"}
                          {payment.reference ? ` · Ref: ${payment.reference}` : ""}
                        </p>
                        <PaymentDetailsView transaction={payment} />
                      </article>
                    );
                  })}
                </div>
              )}
            </section>
          )}
        </>
      )}
      {selectedPartner && (
        <ProjectPartnerDialog
          projectId={selectedPartner.project_id}
          partner={selectedPartner}
          onOpenChange={(open) => {
            if (!open) setSelectedPartner(null);
          }}
          onContribution={recordContribution}
        />
      )}
    </main>
  );
}

function Summary({
  label,
  value,
  note,
  icon: Icon,
  color,
}: {
  label: string;
  value: string;
  note: string;
  icon: typeof Users;
  color: string;
}) {
  return (
    <div className={`partners-metric is-${color}`}>
      <span>
        <Icon size={23} />
      </span>
      <small>{label}</small>
      <strong>{value}</strong>
      <p>{note}</p>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 font-medium">{value || "—"}</p>
    </div>
  );
}
