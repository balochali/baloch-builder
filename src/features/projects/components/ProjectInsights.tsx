import type { ReactNode } from "react";
import type { ProjectBuildingDetails, ProjectEstimate, Transaction } from "@/domain/types";
import { formatCompact, formatPKR } from "@/domain/money";

const colors = ["#174a81", "#d8a72f", "#4a9bb8", "#61ae8b", "#9b86cb"];

function ChartCard({ title, hint, children }: { title: string; hint: string; children: ReactNode }) {
  return <div className="insight-card"><div className="insight-heading"><h3>{title}</h3><p>{hint}</p></div>{children}</div>;
}

export function BuildingMixChart({ details }: { details: ProjectBuildingDetails }) {
  const values = [
    { label: "Flats", value: details.planned_flats ?? 0 },
    { label: "Shops", value: details.planned_shops ?? 0 },
    { label: "Offices", value: details.planned_offices ?? 0 },
    { label: "Houses", value: details.planned_houses ?? 0 },
  ].filter((item) => item.value > 0);
  const total = values.reduce((sum, item) => sum + item.value, 0);
  if (!total) return null;
  let running = 0;
  const stops = values.map((item, index) => {
    const start = running;
    running += item.value / total * 100;
    return `${colors[index]} ${start}% ${running}%`;
  });
  return <ChartCard title="What is being built" hint="Planned spaces by type">
    <div className="donut-layout"><div className="donut-chart" style={{ background: `conic-gradient(${stops.join(", ")})` }} role="img" aria-label={values.map((item) => `${item.value} ${item.label.toLowerCase()}`).join(", ")}><div><strong>{total}</strong><span>spaces</span></div></div>
      <div className="chart-legend">{values.map((item, index) => <div key={item.label}><span><i style={{ background: colors[index] }} />{item.label}</span><strong>{item.value}</strong></div>)}</div></div>
  </ChartCard>;
}

export function OwnershipChart({ partners }: { partners: { name: string; share_bp: number }[] }) {
  if (!partners.length) return null;
  const allocated = partners.reduce((sum, item) => sum + item.share_bp, 0);
  const values = [...partners.map((item) => ({ label: item.name, value: item.share_bp })), ...(allocated < 10_000 ? [{ label: "Unallocated", value: 10_000 - allocated }] : [])];
  let running = 0;
  const stops = values.map((item, index) => {
    const start = running;
    running += item.value / 100;
    return `${colors[index % colors.length]} ${start}% ${running}%`;
  });
  return <ChartCard title="Ownership at a glance" hint="How the project share is divided">
    <div className="donut-layout"><div className="donut-chart" style={{ background: `conic-gradient(${stops.join(", ")})` }} role="img" aria-label={values.map((item) => `${item.label} ${(item.value / 100).toFixed(2)} percent`).join(", ")}><div><strong>{(allocated / 100).toFixed(0)}%</strong><span>allocated</span></div></div>
      <div className="chart-legend">{values.map((item, index) => <div key={index}><span><i style={{ background: colors[index % colors.length] }} />{item.label}</span><strong>{(item.value / 100).toFixed(item.value % 100 ? 2 : 0)}%</strong></div>)}</div></div>
  </ChartCard>;
}

export function EstimateChart({ items, title }: { items: ProjectEstimate[]; title: string }) {
  if (!items.length) return null;
  const displayed = [...items].sort((a, b) => b.maximum_amount - a.maximum_amount).slice(0, 6);
  const max = Math.max(...displayed.map((item) => item.maximum_amount), 1);
  return <ChartCard title={title} hint="Gold is the minimum; blue extends to the maximum">
    <div className="estimate-chart">{displayed.map((item) => <div className="estimate-chart-row" key={item.id}>
      <div className="estimate-chart-label"><strong title={item.title}>{item.title}</strong><span>{formatCompact(item.minimum_amount)} – {formatCompact(item.maximum_amount)}</span></div>
      <div className="estimate-chart-track" role="img" aria-label={`${item.title}: ${formatPKR(item.minimum_amount)} to ${formatPKR(item.maximum_amount)}`}><div className="estimate-chart-max" style={{ width: `${item.maximum_amount / max * 100}%` }} /><div className="estimate-chart-min" style={{ width: `${item.minimum_amount / max * 100}%` }} /></div>
    </div>)}{items.length > 6 && <p className="insight-note">Showing the six largest items. All items remain listed below.</p>}</div>
  </ChartCard>;
}

export function SpendingChart({ costs }: { costs: Transaction[] }) {
  if (!costs.length) return null;
  const byDate = new Map<string, number>();
  for (const cost of costs) byDate.set(cost.date, (byDate.get(cost.date) ?? 0) + cost.amount);
  const dates = [...byDate.keys()].sort();
  const series = dates.reduce<{ date: string; amount: number }[]>((rows, date) => {
    const previous = rows.length ? rows[rows.length - 1].amount : 0;
    return [...rows, { date, amount: previous + (byDate.get(date) ?? 0) }];
  }, []);
  const max = series[series.length - 1].amount || 1;
  const points = [{ x: 0, y: 110 }, ...series.map((item, index) => ({ x: dates.length === 1 ? 300 : index / (dates.length - 1) * 300, y: 110 - item.amount / max * 94 }))];
  const path = points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");
  const last = series[series.length - 1];
  return <ChartCard title="Spending over time" hint="Running total of recorded project costs">
    <div className="spending-total"><strong>{formatPKR(last.amount)}</strong><span>spent so far</span></div>
    <svg className="spending-chart" viewBox="0 0 300 120" preserveAspectRatio="none" role="img" aria-label={`Spending rose to ${formatPKR(last.amount)} by ${last.date}`}>
      <defs><linearGradient id="spending-fill" x1="0" y1="0" x2="0" y2="1"><stop stopColor="#3278b7" stopOpacity=".25" /><stop offset="1" stopColor="#3278b7" stopOpacity="0" /></linearGradient></defs>
      <path d={`${path} L 300 120 L 0 120 Z`} fill="url(#spending-fill)" /><path d={path} fill="none" stroke="#d8a72f" strokeWidth="3" vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
    <div className="spending-axis"><span>{dates[0]}</span><span>{dates.length > 1 ? last.date : ""}</span></div>
    <p className="insight-note">Each point adds the payments recorded on that date.</p>
  </ChartCard>;
}
