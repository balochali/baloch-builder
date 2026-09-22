import type { ReactNode } from "react";
import type { ProjectBuildingDetails, ProjectEstimate, Transaction } from "@/domain/types";
import { formatCompact, formatPKR } from "@/domain/money";
import type { ProjectPartnerRow } from "@/data/repositories/projectPartnersRepository";
import { decodeFloorLayout } from "@/data/repositories/projectBuildingRepository";

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
  const largest = values.reduce((current, item) => item.value > current.value ? item : current);
  const largestPercent = Math.round(largest.value / total * 100);
  return <ChartCard title="What is being built" hint="Planned spaces by type">
    <div className="building-mix-layout"><div className="donut-chart" style={{ background: `conic-gradient(${stops.join(", ")})` }} role="img" aria-label={values.map((item) => `${item.value} ${item.label.toLowerCase()}`).join(", ")}><div><strong>{total}</strong><span>spaces</span></div></div>
      <div className="building-mix-breakdown">{values.map((item, index) => <div className="building-mix-row" key={item.label}>
        <div className="building-mix-label"><span><i style={{ background: colors[index] }} />{item.label}</span><strong>{item.value} <small>({Math.round(item.value / total * 100)}%)</small></strong></div>
        <div className="building-mix-track" role="img" aria-label={`${item.label}: ${item.value} of ${total} planned spaces`}><span style={{ width: `${item.value / total * 100}%`, background: colors[index] }} /></div>
      </div>)}</div></div>
    <div className="building-mix-takeaway"><strong>At a glance</strong><p>{values.length === 1 ? `All ${total} planned spaces are ${largest.label.toLowerCase()}.` : `${largest.label} make up the largest part of the plan: ${largest.value} of ${total} spaces (${largestPercent}%).`}</p></div>
  </ChartCard>;
}

export function BuildingLevelsChart({ details }: { details: ProjectBuildingDetails }) {
  const floors = Math.max(0, details.floors_above_ground ?? 0);
  const basements = Math.max(0, details.basement_count ?? 0);
  if (!floors && !basements) return null;
  const shownFloors = Math.min(floors, 6);
  const shownBasements = Math.min(basements, 2);
  const floorLayout = decodeFloorLayout(details.floor_layout_json ?? "[]");
  const floorUnitCount = (floorIndex: number) => floorLayout.find((floor) => floor.floor_index === floorIndex)
    ?.flat_types.reduce((total, type) => total + type.count, 0) ?? 0;
  return <ChartCard title="How tall is the plan?" hint="A simple view of the planned floors and basements.">
    <div className="building-levels-layout">
      <div className="building-levels-visual" role="img" aria-label={`${floors} ${floors === 1 ? "floor" : "floors"} above ground and ${basements} ${basements === 1 ? "basement" : "basements"} planned`}>
        <div className="building-roof"><span>{details.building_use?.replace("-", " ") || "Building"}</span></div>
        {floors > shownFloors && <span className="building-levels-extra">+ {floors - shownFloors} more floors</span>}
        {Array.from({ length: shownFloors }, (_, index) => {
          const floorIndex = floors - index - 1;
          const units = floorUnitCount(floorIndex);
          return <div key={`floor-${floorIndex}`} className="building-level above"><span>{floorIndex === 0 ? "Ground" : `Floor ${floorIndex}`}</span><span className="building-level-units">{units ? `${units} flat${units === 1 ? "" : "s"}` : ""}</span><i /><i /><i /></div>;
        })}
        <div className="building-ground-line" />
        {Array.from({ length: shownBasements }, (_, index) => <div key={`basement-${index}`} className="building-level below"><span>Basement {index + 1}</span><i /><i /><i /></div>)}
        {basements > shownBasements && <span className="building-levels-extra">+ {basements - shownBasements} more basements</span>}
      </div>
      <div className="building-levels-summary"><div><strong>{floors}</strong><span>{floors === 1 ? "floor" : "floors"} above ground</span></div><div><strong>{basements}</strong><span>{basements === 1 ? "basement" : "basements"} planned</span></div><p>The ground floor is included in the floor count.</p></div>
    </div>
  </ChartCard>;
}

export function BuildingAreaChart({ details }: { details: ProjectBuildingDetails }) {
  if (details.plot_area_value === null && details.covered_area_sqft === null && details.parking_area_value === null) return null;
  const plotLabel = details.plot_area_value === null ? "Not added" : `${details.plot_area_value.toLocaleString()} ${details.plot_area_unit === "sqyd" ? "sq yd" : details.plot_area_unit ?? ""}`;
  const coveredLabel = details.covered_area_sqft === null ? "Not added" : `${details.covered_area_sqft.toLocaleString()} sq ft`;
  const parkingLabel = details.parking_area_value === null ? "Not added" : `${details.parking_area_value.toLocaleString()} ${details.parking_area_unit === "sqyd" ? "sq yd" : "sq ft"}`;
  const plotComparable = details.plot_area_unit === "sqyd" ? (details.plot_area_value ?? 0) * 9 : details.plot_area_unit === "sqft" ? details.plot_area_value ?? 0 : 0;
  const parkingComparable = details.parking_area_unit === "sqyd" ? (details.parking_area_value ?? 0) * 9 : details.parking_area_value ?? 0;
  const values = [plotComparable, details.covered_area_sqft ?? 0, parkingComparable];
  const max = Math.max(...values, 1);
  return <ChartCard title="Area overview" hint="Bar lengths compare equivalent square feet. The original entered units remain beside each value.">
    <div className="building-area-chart">
      {[{ label: "Plot area", value: plotComparable, display: plotLabel, color: "#d8a72f" }, { label: "Covered area", value: details.covered_area_sqft ?? 0, display: coveredLabel, color: "#256aa3" }, { label: "Parking area", value: parkingComparable, display: parkingLabel, color: "#4a9bb8" }].map((item) => <div className="building-area-row" key={item.label}>
        <div><strong>{item.label}</strong><span>{item.display}</span></div><div className="building-area-track"><span style={{ width: `${item.value / max * 100}%`, background: item.color }} /></div>
      </div>)}
    </div>
  </ChartCard>;
}

export function FlatLayoutChart({ details }: { details: ProjectBuildingDetails }) {
  const floors = decodeFloorLayout(details.floor_layout_json ?? "[]").filter((floor) => floor.flat_types.length > 0);
  if (!floors.length) return null;
  return <section className="flat-layout-visual">
    <div className="flat-layout-heading"><div><h3>Flat layout by floor</h3><p>Each apartment shape is one planned flat. Dots show its number of rooms.</p></div><span>{floors.reduce((total, floor) => total + floor.flat_types.reduce((sum, type) => sum + type.count, 0), 0)} flats mapped</span></div>
    <div className="flat-floor-grid">{floors.map((floor) => {
      const flatCount = floor.flat_types.reduce((total, type) => total + type.count, 0);
      return <article className="flat-floor-card" key={floor.floor_index} role="img" aria-label={`${floor.floor_index === 0 ? "Ground floor" : `Floor ${floor.floor_index}`}: ${floor.flat_types.map((type) => `${type.count} ${type.rooms}-room flat${type.count === 1 ? "" : "s"}`).join(", ")}`}>
        <div className="flat-floor-title"><span>{floor.floor_index === 0 ? "Ground" : `Floor ${floor.floor_index}`}</span><strong>{flatCount} {flatCount === 1 ? "flat" : "flats"}</strong></div>
        <div className="flat-units">{floor.flat_types.flatMap((type) => Array.from({ length: type.count }, (_, index) => <div className="flat-unit" key={`${type.rooms}-${index}`} title={`${type.rooms}-room flat`}>
          <span className="flat-door" /><span className="flat-room-dots">{Array.from({ length: type.rooms }, (_, room) => <i key={room} />)}</span><small>{type.rooms} room</small>
        </div>))}</div>
        <div className="flat-floor-summary">{floor.flat_types.map((type) => `${type.count} × ${type.rooms}-room`).join(" · ")}</div>
      </article>;
    })}</div>
  </section>;
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
  const largest = [...partners].sort((a, b) => b.share_bp - a.share_bp)[0];
  return <ChartCard title="Who owns what?" hint="Each colored slice is one partner's share of this project.">
    <div className="donut-layout"><div className="donut-chart" style={{ background: `conic-gradient(${stops.join(", ")})` }} role="img" aria-label={values.map((item) => `${item.label} ${(item.value / 100).toFixed(2)} percent`).join(", ")}><div><strong>{(allocated / 100).toFixed(0)}%</strong><span>assigned</span></div></div>
      <div className="chart-legend">{values.map((item, index) => <div key={index}><span><i style={{ background: colors[index % colors.length] }} />{item.label}</span><strong>{(item.value / 100).toFixed(item.value % 100 ? 2 : 0)}%</strong></div>)}</div></div>
    <div className="chart-takeaway"><strong>What this means</strong><p>{allocated === 10_000 ? "The full project share has been assigned to partners." : `${((10_000 - allocated) / 100).toFixed(2)}% of the project share has not been assigned yet.`} {largest.name} has the largest share at {(largest.share_bp / 100).toFixed(largest.share_bp % 100 ? 2 : 0)}%.</p></div>
  </ChartCard>;
}

export function PartnerFundingChart({ partners }: { partners: ProjectPartnerRow[] }) {
  const committed = partners.filter((partner) => partner.agreed_contribution !== null);
  if (!partners.length) return null;
  if (!committed.length) return <ChartCard title="Money promised and received" hint="See how much each partner has paid and what is still due.">
    <div className="chart-takeaway"><strong>No payment target recorded</strong><p>These partners have no agreed contribution amount saved. Payments can still be recorded, but there is no target to compare them with.</p></div>
  </ChartCard>;
  const received = committed.reduce((sum, partner) => sum + partner.contributed, 0);
  const remaining = committed.reduce((sum, partner) => sum + Math.max(0, (partner.agreed_contribution ?? 0) - partner.contributed), 0);
  return <ChartCard title="Money promised and received" hint="Blue shows money received. Gold shows what is still due.">
    <div className="partner-funding-totals"><div><span>Received</span><strong>{formatPKR(received)}</strong></div><div><span>Remaining</span><strong>{formatPKR(remaining)}</strong></div></div>
    <div className="partner-funding-list">{committed.map((partner) => {
      const target = partner.agreed_contribution ?? 0;
      const due = Math.max(0, target - partner.contributed);
      const percent = target > 0 ? Math.min(100, partner.contributed / target * 100) : 100;
      return <div className="partner-funding-row" key={partner.partnership_id}>
        <div className="partner-funding-line"><strong>{partner.name}</strong><span>{formatCompact(partner.contributed)} of {formatCompact(target)} received</span></div>
        <div className="partner-funding-track" role="img" aria-label={`${partner.name}: ${formatPKR(partner.contributed)} received, ${formatPKR(due)} remaining`}><div style={{ width: `${percent}%` }} /></div>
        <p>{due > 0 ? `${formatPKR(due)} still to receive` : partner.contributed > target ? `${formatPKR(partner.contributed - target)} above the agreed amount` : "Fully received"}</p>
      </div>;
    })}</div>
    {committed.length < partners.length && <p className="insight-note">Remaining excludes partners who have no agreed amount saved.</p>}
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
