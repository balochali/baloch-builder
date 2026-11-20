import { Check, Circle } from "lucide-react";
import { formatSummaryPKR } from "./feasibilityFormat";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { feasibilitySchema, type Project, type LandSheet, type SalesSheet } from "@baloch/shared";
import { api } from "@/data/api";
import { whole } from "@/components/grid/DataGrid";
import { calculateFeasibility } from "./feasibilityCalc";
import { balance, partnerTotals, validLines } from "./fundingView";
import type { FundingData } from "./MoneyEntryForm";
import { totalLandArea, type SiteData } from "./projectSite";
import { friendlyError } from "./Sales";
export function ProjectOverview({
  project,
  site,
  ledger,
}: {
  project: Project;
  site?: SiteData;
  ledger: boolean;
}) {
  const [data, setData] = useState<{ land: LandSheet; sales: SalesSheet; funding: FundingData }>(),
    [error, setError] = useState("");
  useEffect(() => {
    if (!ledger) return;
    let live = true;
    Promise.all([
      api<LandSheet>(`projects/${project.id}/land`),
      api<SalesSheet>(`projects/${project.id}/sales`),
      api<FundingData>(`projects/${project.id}/funding`),
    ])
      .then(([land, sales, funding]) => {
        if (live) setData({ land, sales, funding });
      })
      .catch((e) => {
        if (live) setError(friendlyError(e));
      });
    return () => {
      live = false;
    };
  }, [project.id, ledger]);
  const base = `/projects/${project.id}`;
  if (!ledger)
    return (
      <section>
        <h2>{project.name}</h2>
        <p>
          {project.status} · {site?.building?.buildingType}
        </p>
        <Link to={base + "/building"}>Open Building</Link>
      </section>
    );
  if (!data) return <p role={error ? "alert" : "status"}>{error || "Loading project overview…"}</p>;
  const parsed = feasibilitySchema.safeParse(data.funding.plan);
  const plan = parsed.success ? parsed.data : null;
  const forecast = plan ? calculateFeasibility(plan) : null;
  const lines = validLines(data.funding.lines);
  const contributed = partnerTotals(lines).contributed;
  const committed = plan?.partners.reduce((s, p) => s + p.capital, 0) ?? 0;
  const units = site?.building.units.reduce((s, u) => s + u.count, 0) ?? 0;
  const checks: [string, boolean, string][] = [
    ["Feasibility approved", plan?.status === "approved", "feasibility"],
    ["Land recorded", !!site?.parcels.length, "land"],
    [
      "Land payments complete",
      data.land.totals.agreedPrice > 0 && data.land.totals.remaining === 0,
      "land",
    ],
    [
      "Partners linked with funding complete",
      data.funding.links.length > 0 && committed > 0 && contributed >= committed,
      "partners",
    ],
    ["Building details filled", units > 0, "building"],
    ["Units generated", data.sales.totals.total > 0 && data.sales.totals.total >= units, "sales"],
    ["All units sold", data.sales.totals.total > 0 && data.sales.totals.available === 0, "sales"],
    [
      "All sales fully paid",
      data.sales.totals.total > 0 && data.sales.totals.fullyPaid === data.sales.totals.total,
      "sales",
    ],
  ];
  const done = checks.filter((c) => c[1]).length;
  const money = (value: number) => <span title={whole(value)}>{formatSummaryPKR(value)}</span>;
  const cards = [
    { name: "Project facts", tab: "overview", value: project.name, caption: project.status },
    {
      name: "Land",
      tab: "land",
      value: money(data.land.totals.agreedPrice),
      caption: (
        <>
          {site?.parcels.length ?? 0} parcels ·{" "}
          {whole(site ? totalLandArea(site.parcels, "Sq ft") : 0)} sq ft
          <br />
          Paid {money(data.land.totals.totalPaid)} · Remaining {money(data.land.totals.remaining)}
        </>
      ),
    },
    {
      name: "Building",
      tab: "building",
      value: `${units} planned units`,
      caption: (
        <>
          {site?.building.buildingType ?? "Not entered"} · {site?.building.floors.length ?? 0}{" "}
          floors
        </>
      ),
    },
    {
      name: "Funding",
      tab: "partners",
      value: money(contributed),
      caption: (
        <>
          Contributed · Committed {money(committed)}
          <br />
          Pending {money(Math.max(0, committed - contributed))}
          <br />
          Loans outstanding {money(-balance(lines, "2300"))}
          <br />
          Funds available {money(balance(lines, "1000") + balance(lines, "1010"))}
          <br />
          Customer advances {money(-balance(lines, "2200"))}
        </>
      ),
    },
    {
      name: "Sales",
      tab: "sales",
      value: money(data.sales.totals.saleValue),
      caption: (
        <>
          Sold value · Received {money(data.sales.totals.received)}
          <br />
          Remaining {money(data.sales.totals.remaining)} · Overdue{" "}
          {money(data.sales.totals.overdue)}
        </>
      ),
    },
    {
      name: "Feasibility",
      tab: "feasibility",
      value: plan?.status === "approved" ? "Approved" : "Draft",
      caption: (
        <>
          Worst profit {money(forecast?.profit.worst ?? 0)} · Best profit{" "}
          {money(forecast?.profit.best ?? 0)}
        </>
      ),
    },
  ];
  return (
    <>
      <div className="sales-summary">
        {cards.map((card) => (
          <Link className="overview-card" key={card.name} to={base + "/" + card.tab}>
            <span className="overview-card-label">{card.name}</span>
            <strong className="overview-card-value">{card.value}</strong>
            <p className="overview-card-caption">{card.caption}</p>
          </Link>
        ))}
      </div>
      <section className="project-detail-panel">
        <h2>Setup checklist</h2>
        <p>Version 1 setup: {done} of 8 done</p>
        <progress max={8} value={done} aria-label="Version 1 setup progress" />
        <ul className="overview-checklist">
          {checks.map(([label, complete, tab]) => (
            <li key={label}>
              <Link to={base + "/" + tab}>
                {complete ? (
                  <Check size={18} aria-label="Done" />
                ) : (
                  <Circle size={18} aria-label="Not done" />
                )}{" "}
                {label}
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
export function BuildingSalesSummary({
  id,
  building,
}: {
  id: string;
  building: SiteData["building"];
}) {
  const [sheet, setSheet] = useState<SalesSheet>();
  useEffect(() => {
    let live = true;
    api<SalesSheet>(`projects/${id}/sales`)
      .then((s) => {
        if (live) setSheet(s);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [id, building]);
  if (!sheet) return null;
  const changed = sheet.units.some(
    (u) =>
      u.source_unit_type_id &&
      JSON.stringify(u.source_snapshot) !==
        JSON.stringify(building.units.find((t) => t.id === u.source_unit_type_id)),
  );
  return (
    <section className="project-detail-panel">
      <h3>Sellable units</h3>
      {building.units.map((t) => (
        <p key={t.id}>
          {t.name || t.category}: Generated units:{" "}
          {sheet.units.filter((u) => u.source_unit_type_id === t.id).length} of {t.count}
        </p>
      ))}
      {changed && (
        <p>
          Building has changed since units were generated.{" "}
          <Link to={`/projects/${id}/sales`}>Review</Link>
        </p>
      )}
      <Link className="projects-primary" to={`/projects/${id}/sales`}>
        Open Sales
      </Link>
    </section>
  );
}
