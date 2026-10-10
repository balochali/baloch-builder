import { RingChart } from "@/components/charts/RingChart";
import { chartColors } from "@/components/charts/TimeSeriesChart";
import { DashboardMoney } from "./DashboardMoney";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  BookUser,
  Building2,
  MapPin,
  ReceiptText,
  Users,
  Wallet,
  LayoutDashboard,
  HardHat,
  ArrowUpRight,
} from "lucide-react";
import { listContacts } from "@/data/repositories/contactsRepository";
import { listProjects, ProjectStatuses } from "@/data/repositories/projectsRepository";
import {
  listAllProjectPartners,
  listAllPartnerContributions,
  type PartnerOverviewRow,
} from "@/data/repositories/projectPartnersRepository";
import {
  listPersonalExpenses,
  type PersonalExpense,
} from "@/data/repositories/personalExpenseRepository";
import { listUdhaars, type Udhaar } from "@/data/repositories/udhaarRepository";
import { formatPKR, formatPKRInLakhCrore } from "@/domain/money";
import type { Contact, Project, Transaction } from "@/domain/types";
import "./dashboard.css";

type DashboardData = {
  projects: Project[];
  contacts: Contact[];
  partners: PartnerOverviewRow[];
  contributions: Transaction[];
  expenses: PersonalExpense[];
  udhaars: Udhaar[];
};
const emptyData: DashboardData = {
  projects: [],
  contacts: [],
  partners: [],
  contributions: [],
  expenses: [],
  udhaars: [],
};
const sectionNames = [
  "Projects",
  "Contacts",
  "Partners",
  "Partner payments",
  "Personal Expense",
  "Credit / Udhaar",
];
const statusLabels: Record<string, string> = {
  planning: "Planning",
  "land acquired": "Land acquired",
  "under construction": "Under construction",
  completed: "Completed",
  "on hold": "On hold",
  "land sold": "Land Sold",
};
const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);
const stageColors = ["#7089a5", "#ba9556", "#d68b36", "#329582", "#b76b70", "#85818f"];

function Bar({ value, max, color }: { value: number; max: number; color: string }) {
  return (
    <span className="home-bar-track">
      <span style={{ width: `${max ? (value / max) * 100 : 0}%`, background: color }} />
    </span>
  );
}

const dashboardTabs = [
  {
    key: "overview",
    label: "Overview",
    description: "Your business at a glance",
    icon: LayoutDashboard,
  },
  { key: "projects", label: "Projects", description: "Stages & partner funding", icon: Building2 },
  { key: "money", label: "Money", description: "Accounts & payment activity", icon: ReceiptText },
  { key: "udhaar", label: "Udhaar", description: "Repayments & money to collect", icon: Wallet },
] as const;
type DashboardTab = (typeof dashboardTabs)[number]["key"];

export function DashboardPage() {
  const [tab, setTab] = useState<DashboardTab>("overview");
  const [data, setData] = useState<DashboardData>(emptyData);
  const [failed, setFailed] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    async function load() {
      const results = await Promise.allSettled([
        listProjects(),
        listContacts(),
        listAllProjectPartners(),
        listAllPartnerContributions(),
        listPersonalExpenses(),
        listUdhaars(),
      ] as const);
      if (!active) return;
      setData({
        projects: results[0].status === "fulfilled" ? results[0].value : [],
        contacts: results[1].status === "fulfilled" ? results[1].value : [],
        partners: results[2].status === "fulfilled" ? results[2].value : [],
        contributions: results[3].status === "fulfilled" ? results[3].value : [],
        expenses: results[4].status === "fulfilled" ? results[4].value : [],
        udhaars: results[5].status === "fulfilled" ? results[5].value : [],
      });
      setFailed(
        results.flatMap((result, index) =>
          result.status === "rejected" ? [sectionNames[index]] : [],
        ),
      );
      setLoading(false);
    }
    void load();
    return () => {
      active = false;
    };
  }, []);

  const overview = useMemo(() => {
    const received = sum(data.contributions.map((item) => item.amount));
    const spent = sum(data.expenses.map((item) => item.amount));
    const lent = sum(data.udhaars.map((item) => item.amount));
    const repaid = sum(data.udhaars.map((item) => item.paid_amount));
    return {
      received,
      spent,
      lent,
      repaid,
      outstanding: Math.max(0, lent - repaid),
      uniquePartners: new Set(data.partners.map((item) => item.partner_id)).size,
    };
  }, [data]);
  const statusRows = ProjectStatuses.map((status) => ({
    label: statusLabels[status],
    count: data.projects.filter((project) => project.status === status).length,
  }));
  const otherProjects = data.projects.filter(
    (project) => !ProjectStatuses.includes(project.status as (typeof ProjectStatuses)[number]),
  ).length;
  if (otherProjects) statusRows.push({ label: "Other status", count: otherProjects });
  const contributionRows = data.projects
    .map((project) => ({
      label: project.name,
      amount: sum(
        data.contributions
          .filter((item) => item.project_id === project.id)
          .map((item) => item.amount),
      ),
    }))
    .filter((row) => row.amount > 0)
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 5);
  const outstandingPeople = [...data.udhaars]
    .filter((item) => item.amount > item.paid_amount)
    .sort((a, b) => b.amount - b.paid_amount - (a.amount - a.paid_amount))
    .slice(0, 4);
  const cards = [
    {
      title: "Projects",
      value: failed.includes("Projects") ? "Unavailable" : String(data.projects.length),
      hint: "Development projects",
      to: "/projects",
      icon: Building2,
      tone: "blue",
    },
    {
      title: "Partners",
      value: failed.includes("Partners") ? "Unavailable" : String(overview.uniquePartners),
      hint: "People sharing projects",
      to: "/partners",
      icon: Users,
      tone: "gold",
    },
    {
      title: "Contacts",
      value: failed.includes("Contacts") ? "Unavailable" : String(data.contacts.length),
      hint: "Saved people",
      to: "/contacts",
      icon: BookUser,
      tone: "purple",
    },
    {
      title: "Partner payments received",
      value: failed.includes("Partner payments")
        ? "Unavailable"
        : formatPKRInLakhCrore(overview.received),
      hint: "Money paid into projects",
      to: "/partners",
      icon: Users,
      tone: "teal",
    },
    {
      title: "Personal purchases",
      value: failed.includes("Personal Expense")
        ? "Unavailable"
        : formatPKRInLakhCrore(overview.spent),
      hint: "Total recorded spending",
      to: "/personal-expense",
      icon: ReceiptText,
      tone: "coral",
    },
    {
      title: "Udhaar still to receive",
      value: failed.includes("Credit / Udhaar")
        ? "Unavailable"
        : formatPKRInLakhCrore(overview.outstanding),
      hint: "Money others still owe you",
      to: "/credit-udhaar",
      icon: Wallet,
      tone: "blue",
    },
  ];

  const renderCards = (indices: number[]) => (
    <div className="dash-metrics">
      {indices.map((index) => {
        const { title, value, hint, to, icon: Icon, tone } = cards[index];
        return (
          <Link key={title} to={to} className={`dash-metric dash-metric-${tone}`}>
            <span className="dash-metric-icon">
              <Icon size={23} aria-hidden="true" />
            </span>
            <span className="dash-metric-label">{title}</span>
            <strong>{value}</strong>
            <span className="dash-metric-foot">
              {hint}
              <ArrowUpRight size={17} aria-hidden="true" />
            </span>
          </Link>
        );
      })}
    </div>
  );
  return (
    <div className="builder-dashboard">
      <header className="dash-heading">
        <div>
          <span className="dash-eyebrow">
            <HardHat size={16} aria-hidden="true" /> BALOCH BUILDERS & DEVELOPERS
          </span>
          <h1>Dashboard</h1>
          <p>Your projects, your people. A clear picture of your building business.</p>
        </div>
        <Link to="/projects" className="dash-primary">
          Open projects <ArrowUpRight size={18} />
        </Link>
      </header>
      <div className="dash-tabs" role="tablist" aria-label="Dashboard views">
        {dashboardTabs.map(({ key, label, description, icon: Icon }, index) => (
          <button
            key={key}
            type="button"
            role="tab"
            id={`dashboard-tab-${key}`}
            aria-selected={tab === key}
            aria-controls={`dashboard-panel-${key}`}
            tabIndex={tab === key ? 0 : -1}
            onClick={() => setTab(key)}
            onKeyDown={(event) => {
              const next =
                event.key === "ArrowRight"
                  ? (index + 1) % dashboardTabs.length
                  : event.key === "ArrowLeft"
                    ? (index + dashboardTabs.length - 1) % dashboardTabs.length
                    : event.key === "Home"
                      ? 0
                      : event.key === "End"
                        ? dashboardTabs.length - 1
                        : -1;
              if (next < 0) return;
              event.preventDefault();
              setTab(dashboardTabs[next].key);
              document.getElementById(`dashboard-tab-${dashboardTabs[next].key}`)?.focus();
            }}
          >
            <Icon size={22} aria-hidden="true" />
            <span>
              <strong>{label}</strong>
              <small>{description}</small>
            </span>
          </button>
        ))}
      </div>
      {loading ? (
        <div className="dash-loading" role="status">
          Loading your dashboard…
        </div>
      ) : (
        <>
          {failed.length > 0 && (
            <div className="home-message home-warning" role="alert">
              Could not load {failed.join(", ")}. Figures from those sections are unavailable right
              now.
            </div>
          )}
          <div
            className="dash-tab-panel"
            role="tabpanel"
            id={`dashboard-panel-${tab}`}
            aria-labelledby={`dashboard-tab-${tab}`}
            tabIndex={0}
          >
            {tab === "overview" && (
              <>
                <div className="dash-section-intro">
                  <div>
                    <h2>Your business at a glance</h2>
                    <p>A quick starting point. Choose a tab above for the details.</p>
                  </div>
                  <span>All saved records</span>
                </div>
                {renderCards([0, 3, 5])}
                <div className="dash-overview-grid">
                  <section className="home-panel" aria-labelledby="home-recent-title">
                    <div className="home-panel-head">
                      <div>
                        <span className="home-eyebrow">Quick look</span>
                        <h2 id="home-recent-title">Recent projects</h2>
                        <p>Open a project to see the full picture</p>
                      </div>
                      <Link to="/projects">
                        View all <ArrowRight size={16} />
                      </Link>
                    </div>
                    {failed.includes("Projects") ? (
                      <div className="home-empty">Recent projects unavailable right now.</div>
                    ) : data.projects.length ? (
                      <div className="home-record-list">
                        {data.projects.slice(0, 4).map((project) => (
                          <Link to={`/projects/${project.id}`} key={project.id}>
                            <span className="home-record-avatar">
                              <Building2 size={22} aria-hidden="true" />
                            </span>
                            <span>
                              <strong>{project.name}</strong>
                              <small>{project.location || "Location not recorded"}</small>
                            </span>
                            <em>
                              {statusLabels[project.status || ""] || project.status || "No status"}
                            </em>
                            <ArrowRight size={16} />
                          </Link>
                        ))}
                      </div>
                    ) : (
                      <div className="home-empty">
                        Your projects will appear here after you add them.
                      </div>
                    )}
                  </section>
                  <aside className="dash-directory">
                    <span className="dash-eyebrow">YOUR WORKSPACE</span>
                    <h2>Where would you like to go?</h2>
                    <Link to="/partners">
                      <Users />
                      <span>
                        <strong>Partners</strong>
                        <small>
                          {failed.includes("Partners")
                            ? "Unavailable"
                            : overview.uniquePartners + " people sharing projects"}
                        </small>
                      </span>
                      <ArrowUpRight size={18} />
                    </Link>
                    <Link to="/contacts">
                      <BookUser />
                      <span>
                        <strong>Contacts</strong>
                        <small>
                          {failed.includes("Contacts")
                            ? "Unavailable"
                            : data.contacts.length + " saved contacts"}
                        </small>
                      </span>
                      <ArrowUpRight size={18} />
                    </Link>
                    <Link to="/land">
                      <MapPin />
                      <span>
                        <strong>Land records</strong>
                        <small>Locations, areas & purchase details</small>
                      </span>
                      <ArrowUpRight size={18} />
                    </Link>
                    <Link to="/personal-expense">
                      <ReceiptText />
                      <span>
                        <strong>Personal purchases</strong>
                        <small>
                          {failed.includes("Personal Expense")
                            ? "Unavailable"
                            : formatPKRInLakhCrore(overview.spent) + " recorded"}
                        </small>
                      </span>
                      <ArrowUpRight size={18} />
                    </Link>
                  </aside>
                </div>
              </>
            )}
            {tab === "projects" && (
              <>
                <div className="dash-section-intro">
                  <div>
                    <h2>From planning to completion</h2>
                    <p>
                      See where your developments stand and the partner payments received for each.
                    </p>
                  </div>
                </div>
                {renderCards([0, 1, 3])}
                <div className="dash-project-grid">
                  <section className="home-panel" aria-labelledby="home-status-title">
                    <div className="home-panel-head">
                      <div>
                        <span className="home-eyebrow">Projects</span>
                        <h2 id="home-status-title">Where projects stand</h2>
                        <p>Number of projects at each stage</p>
                      </div>
                      <Link to="/projects">
                        View all <ArrowRight size={16} />
                      </Link>
                    </div>
                    {failed.includes("Projects") ? (
                      <div className="home-empty">Project chart unavailable right now.</div>
                    ) : data.projects.length ? (
                      <div className="dashboard-stage-chart">
                        <RingChart
                          value={data.projects.length}
                          label="projects"
                          ariaLabel={statusRows
                            .map((row) => `${row.label}: ${row.count}`)
                            .join("; ")}
                          segments={statusRows.map((row, index) => ({
                            label: row.label,
                            value: row.count,
                            color: stageColors[index],
                          }))}
                        />
                        <div className="home-bars">
                          {statusRows.map((row, index) => (
                            <div className="home-bar-row" key={row.label}>
                              <div>
                                <span>{row.label}</span>
                                <strong>{row.count}</strong>
                              </div>
                              <Bar
                                value={row.count}
                                max={data.projects.length}
                                color={stageColors[index]}
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="home-empty">
                        No projects recorded yet. <Link to="/projects">Add your first project</Link>
                        .
                      </div>
                    )}
                  </section>
                  <section className="home-panel" aria-labelledby="home-funding-title">
                    <div className="home-panel-head">
                      <div>
                        <span className="home-eyebrow">Partners</span>
                        <h2 id="home-funding-title">Partner payments by project</h2>
                        <p>Money received for each project, up to the five highest totals</p>
                      </div>
                      <Link to="/partners">
                        View partners <ArrowRight size={16} />
                      </Link>
                    </div>
                    {failed.includes("Partner payments") || failed.includes("Projects") ? (
                      <div className="home-empty">Payment chart unavailable right now.</div>
                    ) : contributionRows.length ? (
                      <div className="home-bars home-funding-bars">
                        {contributionRows.map((row) => (
                          <div className="home-bar-row" key={row.label}>
                            <div>
                              <span>{row.label}</span>
                              <strong>{formatPKRInLakhCrore(row.amount)}</strong>
                            </div>
                            <Bar
                              value={row.amount}
                              max={contributionRows[0].amount}
                              color="#39a58a"
                            />
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="home-empty">
                        No partner payments recorded yet. <Link to="/partners">Open partners</Link>.
                      </div>
                    )}
                  </section>
                </div>
              </>
            )}
            {tab === "money" && <DashboardMoney />}
            {tab === "udhaar" && (
              <>
                <div className="dash-section-intro">
                  <div>
                    <h2>Keep track of money to collect</h2>
                    <p>Review repayments and the largest remaining balances.</p>
                  </div>
                </div>
                <div className="dash-credit-grid">
                  <section className="home-panel" aria-labelledby="home-udhaar-title">
                    <div className="home-panel-head">
                      <div>
                        <span className="home-eyebrow">Credit / Udhaar</span>
                        <h2 id="home-udhaar-title">Money lent out</h2>
                        <p>How much has come back so far</p>
                      </div>
                      <Link to="/credit-udhaar">
                        View all <ArrowRight size={16} />
                      </Link>
                    </div>
                    {failed.includes("Credit / Udhaar") ? (
                      <div className="home-empty">Udhaar chart unavailable right now.</div>
                    ) : overview.lent ? (
                      <div className="home-udhaar-chart">
                        <RingChart
                          value={Math.round((overview.repaid / overview.lent) * 100) + "%"}
                          label="paid back"
                          ariaLabel={
                            formatPKR(overview.repaid) +
                            " paid back out of " +
                            formatPKR(overview.lent) +
                            " lent"
                          }
                          segments={[
                            {
                              label: "Paid back",
                              value: overview.repaid,
                              color: chartColors.green,
                              display: formatPKR(overview.repaid),
                            },
                            {
                              label: "Still to receive",
                              value: overview.outstanding,
                              color: chartColors.coral,
                              display: formatPKR(overview.outstanding),
                            },
                          ]}
                        />
                        <div className="home-udhaar-legend">
                          <div>
                            <i className="home-dot" style={{ background: chartColors.green }} />
                            <span>Paid back</span>
                            <strong>{formatPKRInLakhCrore(overview.repaid)}</strong>
                          </div>
                          <div>
                            <i className="home-dot" style={{ background: chartColors.coral }} />
                            <span>Still to receive</span>
                            <strong>{formatPKRInLakhCrore(overview.outstanding)}</strong>
                          </div>
                          <p>Total given: {formatPKRInLakhCrore(overview.lent)}</p>
                        </div>
                      </div>
                    ) : (
                      <div className="home-empty">
                        No Udhaar recorded yet. <Link to="/credit-udhaar">Record money lent</Link>.
                      </div>
                    )}
                  </section>
                  <div className="home-panel home-people">
                    <div className="home-panel-head">
                      <div>
                        <span className="home-eyebrow">People</span>
                        <h2>Udhaar to collect</h2>
                        <p>Largest remaining balances</p>
                      </div>
                      <Link to="/credit-udhaar">
                        View all <ArrowRight size={16} />
                      </Link>
                    </div>
                    {failed.includes("Credit / Udhaar") ? (
                      <div className="home-empty">Udhaar balances unavailable right now.</div>
                    ) : outstandingPeople.length ? (
                      <div className="home-record-list">
                        {outstandingPeople.map((item) => (
                          <Link to="/credit-udhaar" key={item.id}>
                            <span className="home-record-avatar">
                              {item.borrower_name.slice(0, 1).toUpperCase()}
                            </span>
                            <span>
                              <strong>{item.borrower_name}</strong>
                              <small>
                                {item.due_date ? `Due ${item.due_date}` : "No due date set"}
                              </small>
                            </span>
                            <b>{formatPKRInLakhCrore(item.amount - item.paid_amount)}</b>
                            <ArrowRight size={16} />
                          </Link>
                        ))}
                      </div>
                    ) : (
                      <div className="home-empty">No outstanding Udhaar balances.</div>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
