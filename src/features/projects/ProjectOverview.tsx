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
  const cards: [string, string, string[]][] = [
    ["Project facts", "overview", [project.name, project.status]],
    [
      "Land",
      "land",
      [
        `${site?.parcels.length ?? 0} parcels · ${whole(site ? totalLandArea(site.parcels, "Sq ft") : 0)} sq ft`,
        `Land value: ${whole(data.land.totals.agreedPrice)}`,
        `Paid: ${whole(data.land.totals.totalPaid)} · Remaining: ${whole(data.land.totals.remaining)}`,
      ],
    ],
    [
      "Building",
      "building",
      [
        site?.building.buildingType ?? "Not entered",
        `${site?.building.floors.length ?? 0} floors · ${units} planned units`,
      ],
    ],
    [
      "Funding",
      "partners",
      [
        `Committed: ${whole(committed)} · Contributed: ${whole(contributed)}`,
        `Pending: ${whole(Math.max(0, committed - contributed))}`,
        `Loans outstanding: ${whole(-balance(lines, "2300"))}`,
        `Funds available: ${whole(balance(lines, "1000") + balance(lines, "1010"))}`,
        `Customer advances: ${whole(-balance(lines, "2200"))}`,
      ],
    ],
    [
      "Sales",
      "sales",
      [
        `Sold value: ${whole(data.sales.totals.saleValue)}`,
        `Money received: ${whole(data.sales.totals.received)}`,
        `Still to receive: ${whole(data.sales.totals.remaining)}`,
        `Overdue: ${whole(data.sales.totals.overdue)}`,
      ],
    ],
    [
      "Feasibility",
      "feasibility",
      [
        plan?.status === "approved" ? "Approved" : "Draft",
        `Worst profit: ${whole(forecast?.profit.worst ?? 0)}`,
        `Best profit: ${whole(forecast?.profit.best ?? 0)}`,
      ],
    ],
  ];
  return (
    <>
      <div className="sales-summary">
        {cards.map(([name, tab, facts]) => (
          <Link key={name} to={base + "/" + tab}>
            <h3>{name}</h3>
            {facts.map((f) => (
              <p key={f}>{f}</p>
            ))}
          </Link>
        ))}
      </div>
      <section className="project-detail-panel">
        <h2>Setup checklist</h2>
        <p>Version 1 setup: {done} of 8 done</p>
        <progress max={8} value={done} aria-label="Version 1 setup progress" />
        <ul>
          {checks.map(([label, complete, tab]) => (
            <li key={label}>
              <Link to={base + "/" + tab}>
                {complete ? "✓ Done" : "○ Not done"} · {label}
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
