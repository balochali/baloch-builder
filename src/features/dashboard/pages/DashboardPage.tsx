import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, BookUser, FolderKanban, MapPin, ReceiptText, Users, Wallet } from "lucide-react";
import { listContacts } from "@/data/repositories/contactsRepository";
import { listProjects, ProjectStatuses } from "@/data/repositories/projectsRepository";
import { listAllProjectPartners, listAllPartnerContributions, type PartnerOverviewRow } from "@/data/repositories/projectPartnersRepository";
import { ExpenseCategories, listPersonalExpenses, type PersonalExpense } from "@/data/repositories/personalExpenseRepository";
import { listUdhaars, type Udhaar } from "@/data/repositories/udhaarRepository";
import { formatPKR, formatPKRInLakhCrore } from "@/domain/money";
import type { Contact, Project, Transaction } from "@/domain/types";

type DashboardData = { projects: Project[]; contacts: Contact[]; partners: PartnerOverviewRow[]; contributions: Transaction[]; expenses: PersonalExpense[]; udhaars: Udhaar[] };
const emptyData: DashboardData = { projects: [], contacts: [], partners: [], contributions: [], expenses: [], udhaars: [] };
const sectionNames = ["Projects", "Contacts", "Partners", "Partner payments", "Personal Expense", "Credit / Udhaar"];
const statusLabels: Record<string, string> = { planning: "Planning", "land acquired": "Land acquired", "under construction": "Under construction", completed: "Completed", "on hold": "On hold" };
const categoryLabels: Record<string, string> = { car: "Cars", watch: "Watches", land: "Land", house: "Houses", other: "Other" };
const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);

function Bar({ value, max, color }: { value: number; max: number; color: string }) {
  return <span className="home-bar-track"><span style={{ width: `${max ? value / max * 100 : 0}%`, background: color }} /></span>;
}

type MonthPoint = { key: string; label: string; received: number; spent: number };

function monthlyActivity(contributions: Transaction[], expenses: PersonalExpense[]): MonthPoint[] {
  const dates = [...contributions.map((item) => item.date), ...expenses.map((item) => item.purchase_date)]
    .filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date));
  if (!dates.length) return [];
  const sortedMonths = dates.map((date) => date.slice(0, 7)).sort();
  const latest = sortedMonths[sortedMonths.length - 1];
  const [year, month] = latest.split("-").map(Number);
  return Array.from({ length: 6 }, (_, index) => {
    const date = new Date(Date.UTC(year, month - 1 - (5 - index), 1));
    const key = date.toISOString().slice(0, 7);
    return { key, label: date.toLocaleString("en-US", { month: "short", year: "2-digit", timeZone: "UTC" }),
      received: sum(contributions.filter((item) => item.date.startsWith(key)).map((item) => item.amount)),
      spent: sum(expenses.filter((item) => item.purchase_date.startsWith(key)).map((item) => item.amount)) };
  });
}

function ActivityCharts({ months }: { months: MonthPoint[] }) {
  const max = Math.max(1, ...months.flatMap((month) => [month.received, month.spent]));
  const x = (index: number) => 42 + index * 88;
  const y = (value: number) => 192 - value / max * 150;
  const line = (key: "received" | "spent") => months.map((month, index) => `${index ? "L" : "M"} ${x(index)} ${y(month[key])}`).join(" ");
  const chartLabel = months.map((month) => `${month.label}: partner payments ${formatPKR(month.received)}, personal purchases ${formatPKR(month.spent)}`).join("; ");
  return <div className="home-activity-grid">
    <div className="home-activity-visual"><h3>Monthly trend</h3><p>How recorded amounts changed over time</p>
      <svg viewBox="0 0 524 238" role="img" aria-label={`Line chart. ${chartLabel}`}>
        {[0, .5, 1].map((fraction) => <g key={fraction}><line x1="42" x2="482" y1={y(max * fraction)} y2={y(max * fraction)} className="home-chart-grid" /><text x="36" y={y(max * fraction) + 4} textAnchor="end" className="home-chart-tick">{formatPKRInLakhCrore(max * fraction).replace("Rs ", "")}</text></g>)}
        <path d={line("received")} fill="none" stroke="#2b7fb7" strokeWidth="3.5" strokeLinejoin="round" strokeLinecap="round" />
        <path d={line("spent")} fill="none" stroke="#e5ad38" strokeWidth="3.5" strokeLinejoin="round" strokeLinecap="round" />
        {months.map((month, index) => <g key={month.key}><circle cx={x(index)} cy={y(month.received)} r="4.5" fill="#2b7fb7"><title>{month.label}: partner payments {formatPKR(month.received)}</title></circle><circle cx={x(index)} cy={y(month.spent)} r="4.5" fill="#e5ad38"><title>{month.label}: personal purchases {formatPKR(month.spent)}</title></circle><text x={x(index)} y="221" textAnchor="middle" className="home-chart-tick">{month.label}</text></g>)}
      </svg></div>
    <div className="home-activity-visual"><h3>Month by month</h3><p>Blue bars are partner payments; gold bars are personal purchases</p>
      <div className="home-column-chart" role="img" aria-label={`Bar chart. ${chartLabel}`}>
        {months.map((month) => <div className="home-column-group" key={month.key}><div className="home-column-pair"><span className="home-column home-column-blue" style={{ height: `${month.received ? Math.max(3, month.received / max * 100) : 0}%` }} title={`${month.label}: partner payments ${formatPKR(month.received)}`} /><span className="home-column home-column-gold" style={{ height: `${month.spent ? Math.max(3, month.spent / max * 100) : 0}%` }} title={`${month.label}: personal purchases ${formatPKR(month.spent)}`} /></div><small>{month.label}</small></div>)}
      </div></div>
    <div className="home-chart-legend"><span><i className="home-dot home-dot-blue" />Partner payments received</span><span><i className="home-dot home-dot-gold" />Personal purchases</span><small>These are different types of money; the chart compares their timing, not profit.</small></div>
  </div>;
}

export function DashboardPage() {
  const [data, setData] = useState<DashboardData>(emptyData);
  const [failed, setFailed] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    async function load() {
      const results = await Promise.allSettled([
        listProjects(), listContacts(), listAllProjectPartners(), listAllPartnerContributions(), listPersonalExpenses(), listUdhaars(),
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
      setFailed(results.flatMap((result, index) => result.status === "rejected" ? [sectionNames[index]] : []));
      setLoading(false);
    }
    void load();
    return () => { active = false; };
  }, []);

  const overview = useMemo(() => {
    const received = sum(data.contributions.map((item) => item.amount));
    const spent = sum(data.expenses.map((item) => item.amount));
    const lent = sum(data.udhaars.map((item) => item.amount));
    const repaid = sum(data.udhaars.map((item) => item.paid_amount));
    return { received, spent, lent, repaid, outstanding: Math.max(0, lent - repaid), uniquePartners: new Set(data.partners.map((item) => item.partner_id)).size };
  }, [data]);
  const statusRows = ProjectStatuses.map((status) => ({ label: statusLabels[status], count: data.projects.filter((project) => project.status === status).length }));
  const otherProjects = data.projects.filter((project) => project.status && !ProjectStatuses.includes(project.status as typeof ProjectStatuses[number])).length;
  if (otherProjects) statusRows.push({ label: "Other status", count: otherProjects });
  const expenseRows = ExpenseCategories.map((category) => ({ label: categoryLabels[category], amount: sum(data.expenses.filter((item) => item.category === category).map((item) => item.amount)) })).filter((row) => row.amount > 0);
  const contributionRows = data.projects.map((project) => ({ label: project.name, amount: sum(data.contributions.filter((item) => item.project_id === project.id).map((item) => item.amount)) })).filter((row) => row.amount > 0).sort((a, b) => b.amount - a.amount).slice(0, 5);
  const outstandingPeople = [...data.udhaars].filter((item) => item.amount > item.paid_amount).sort((a, b) => (b.amount - b.paid_amount) - (a.amount - a.paid_amount)).slice(0, 4);
  const activity = monthlyActivity(data.contributions, data.expenses);
  const cards = [
    { title: "Projects", value: failed.includes("Projects") ? "Unavailable" : String(data.projects.length), hint: "Development projects", to: "/projects", icon: FolderKanban, tone: "blue" },
    { title: "Partners", value: failed.includes("Partners") ? "Unavailable" : String(overview.uniquePartners), hint: "People sharing projects", to: "/partners", icon: Users, tone: "gold" },
    { title: "Contacts", value: failed.includes("Contacts") ? "Unavailable" : String(data.contacts.length), hint: "Saved people", to: "/contacts", icon: BookUser, tone: "purple" },
    { title: "Partner payments received", value: failed.includes("Partner payments") ? "Unavailable" : formatPKRInLakhCrore(overview.received), hint: "Money paid into projects", to: "/partners", icon: Users, tone: "teal" },
    { title: "Personal purchases", value: failed.includes("Personal Expense") ? "Unavailable" : formatPKRInLakhCrore(overview.spent), hint: "Total recorded spending", to: "/personal-expense", icon: ReceiptText, tone: "coral" },
    { title: "Udhaar still to receive", value: failed.includes("Credit / Udhaar") ? "Unavailable" : formatPKRInLakhCrore(overview.outstanding), hint: "Money others still owe you", to: "/credit-udhaar", icon: Wallet, tone: "blue" },
  ];

  return <main className="home-dashboard">
    <header className="home-hero"><div><span className="home-eyebrow">Baloch Builders & Developers</span><h1>Your business at a glance</h1><p>See what is happening across your saved records. Select any card to open that section.</p></div><Link to="/projects" className="home-hero-action">View projects <ArrowRight size={18} /></Link></header>
    {loading ? <div className="home-message" role="status">Loading your dashboard…</div> : <>
      {failed.length > 0 && <div className="home-message home-warning" role="alert">Could not load {failed.join(", ")}. Figures from those sections are unavailable right now.</div>}
      <section aria-labelledby="home-overview-title"><div className="home-section-heading"><div><span className="home-eyebrow">Overview</span><h2 id="home-overview-title">The key numbers</h2></div><small>From your saved records</small></div><div className="home-kpis">{cards.map(({ title, value, hint, to, icon: Icon, tone }) => <Link to={to} className={`home-kpi home-${tone}`} key={title}><span className="home-kpi-icon"><Icon size={21} /></span><span className="home-kpi-title">{title}</span><strong>{value}</strong><span className="home-kpi-foot">{hint}<ArrowRight size={16} /></span></Link>)}</div></section>
      <section className="home-panel home-activity-panel" aria-labelledby="home-activity-title"><div className="home-panel-head"><div><span className="home-eyebrow">Activity over time</span><h2 id="home-activity-title">What changed each month</h2><p>The latest six calendar months ending with your most recent payment or purchase</p></div></div>{failed.includes("Partner payments") || failed.includes("Personal Expense") ? <div className="home-empty">Monthly charts are unavailable right now.</div> : activity.length ? <ActivityCharts months={activity} /> : <div className="home-empty">Record a partner payment or personal purchase to see monthly charts here.</div>}</section>
      <div className="home-panels">
        <section className="home-panel" aria-labelledby="home-status-title"><div className="home-panel-head"><div><span className="home-eyebrow">Projects</span><h2 id="home-status-title">Where projects stand</h2><p>Number of projects at each stage</p></div><Link to="/projects">View all <ArrowRight size={16} /></Link></div>{failed.includes("Projects") ? <div className="home-empty">Project chart unavailable right now.</div> : data.projects.length ? <div className="home-bars">{statusRows.map((row, index) => <div className="home-bar-row" key={row.label}><div><span>{row.label}</span><strong>{row.count}</strong></div><Bar value={row.count} max={Math.max(1, ...statusRows.map((item) => item.count))} color={["#327eb6", "#e7ae32", "#41a991", "#795fc3", "#d57d61", "#72869b"][index]} /></div>)}</div> : <div className="home-empty">No projects recorded yet. <Link to="/projects">Add your first project</Link>.</div>}</section>
        <section className="home-panel" aria-labelledby="home-udhaar-title"><div className="home-panel-head"><div><span className="home-eyebrow">Credit / Udhaar</span><h2 id="home-udhaar-title">Money lent out</h2><p>How much has come back so far</p></div><Link to="/credit-udhaar">View all <ArrowRight size={16} /></Link></div>{failed.includes("Credit / Udhaar") ? <div className="home-empty">Udhaar chart unavailable right now.</div> : overview.lent ? <div className="home-udhaar-chart"><div className="home-donut" role="img" aria-label={`${formatPKR(overview.repaid)} paid back out of ${formatPKR(overview.lent)} lent`} style={{ background: `conic-gradient(#37a98d 0 ${Math.min(100, overview.repaid / overview.lent * 100)}%, #e8b441 0 100%)` }}><span><strong>{Math.round(overview.repaid / overview.lent * 100)}%</strong><small>paid back</small></span></div><div className="home-udhaar-legend"><div><i className="home-dot home-dot-teal" /><span>Paid back</span><strong>{formatPKRInLakhCrore(overview.repaid)}</strong></div><div><i className="home-dot home-dot-gold" /><span>Still to receive</span><strong>{formatPKRInLakhCrore(overview.outstanding)}</strong></div><p>Total given: {formatPKRInLakhCrore(overview.lent)}</p></div></div> : <div className="home-empty">No Udhaar recorded yet. <Link to="/credit-udhaar">Record money lent</Link>.</div>}</section>
        <section className="home-panel" aria-labelledby="home-expense-title"><div className="home-panel-head"><div><span className="home-eyebrow">Personal Expense</span><h2 id="home-expense-title">Where personal money went</h2><p>Purchases grouped by type</p></div><Link to="/personal-expense">View all <ArrowRight size={16} /></Link></div>{failed.includes("Personal Expense") ? <div className="home-empty">Spending chart unavailable right now.</div> : expenseRows.length ? <div className="home-bars">{expenseRows.map((row, index) => <div className="home-bar-row" key={row.label}><div><span>{row.label}</span><strong>{formatPKRInLakhCrore(row.amount)}</strong></div><Bar value={row.amount} max={Math.max(1, ...expenseRows.map((item) => item.amount))} color={["#397db4", "#e5ac36", "#4aa892", "#806aca", "#d88365"][index]} /></div>)}</div> : <div className="home-empty">No personal purchases recorded yet. <Link to="/personal-expense">Add a purchase</Link>.</div>}</section>
        <section className="home-panel" aria-labelledby="home-recent-title"><div className="home-panel-head"><div><span className="home-eyebrow">Quick look</span><h2 id="home-recent-title">Recent projects</h2><p>Open a project to see the full picture</p></div><Link to="/projects">View all <ArrowRight size={16} /></Link></div>{failed.includes("Projects") ? <div className="home-empty">Recent projects unavailable right now.</div> : data.projects.length ? <div className="home-record-list">{data.projects.slice(0, 4).map((project) => <Link to={`/projects/${project.id}`} key={project.id}><span className="home-record-avatar">{project.name.slice(0, 1).toUpperCase()}</span><span><strong>{project.name}</strong><small>{project.location || "Location not recorded"}</small></span><em>{statusLabels[project.status || ""] || project.status || "No status"}</em><ArrowRight size={16} /></Link>)}</div> : <div className="home-empty">Your projects will appear here after you add them.</div>}</section>
      </div>
      <section className="home-panel" aria-labelledby="home-funding-title"><div className="home-panel-head"><div><span className="home-eyebrow">Partners</span><h2 id="home-funding-title">Partner payments by project</h2><p>Money received for each project, up to the five highest totals</p></div><Link to="/partners">View partners <ArrowRight size={16} /></Link></div>{failed.includes("Partner payments") || failed.includes("Projects") ? <div className="home-empty">Payment chart unavailable right now.</div> : contributionRows.length ? <div className="home-bars home-funding-bars">{contributionRows.map((row) => <div className="home-bar-row" key={row.label}><div><span>{row.label}</span><strong>{formatPKRInLakhCrore(row.amount)}</strong></div><Bar value={row.amount} max={contributionRows[0].amount} color="#39a58a" /></div>)}</div> : <div className="home-empty">No partner payments recorded yet. <Link to="/partners">Open partners</Link>.</div>}</section>
      <section className="home-bottom" aria-label="Other sections"><div className="home-panel home-people"><div className="home-panel-head"><div><span className="home-eyebrow">People</span><h2>Udhaar to collect</h2><p>Largest remaining balances</p></div><Link to="/credit-udhaar">View all <ArrowRight size={16} /></Link></div>{failed.includes("Credit / Udhaar") ? <div className="home-empty">Udhaar balances unavailable right now.</div> : outstandingPeople.length ? <div className="home-record-list">{outstandingPeople.map((item) => <Link to="/credit-udhaar" key={item.id}><span className="home-record-avatar">{item.borrower_name.slice(0, 1).toUpperCase()}</span><span><strong>{item.borrower_name}</strong><small>{item.due_date ? `Due ${item.due_date}` : "No due date set"}</small></span><b>{formatPKRInLakhCrore(item.amount - item.paid_amount)}</b><ArrowRight size={16} /></Link>)}</div> : <div className="home-empty">No outstanding Udhaar balances.</div>}</div><div className="home-panel home-coming"><div className="home-coming-icon"><MapPin size={25} /></div><span className="home-eyebrow">Land</span><h2>Land records are coming soon</h2><p>This section is being built. Your personal land purchases already appear under Personal Expense.</p><Link to="/land">See Land page <ArrowRight size={16} /></Link></div></section>
    </>}
  </main>;
}

