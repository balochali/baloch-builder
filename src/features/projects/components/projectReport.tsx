import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import type { Project, ProjectBuildingDetails, ProjectEstimate, Transaction } from "@/domain/types";
import type { ProjectLand } from "@/data/repositories/projectStageRepository";
import type { ProjectPartnerRow } from "@/data/repositories/projectPartnersRepository";
import type { ProjectSale } from "@/data/repositories/projectSalesRepository";
import type { PartnerPayout } from "@/data/repositories/projectPayoutsRepository";
import {
  decodeBuildingSpaces,
  decodeFloorLayout,
} from "@/data/repositories/projectBuildingRepository";
import { formatPKR } from "@/domain/money";
import { formatDate } from "@/lib/dates";

export const reportSections = [
  {
    id: "dashboard",
    label: "Dashboard",
    description: "Project overview, status and money summary",
  },
  { id: "building", label: "Building", description: "Land, floors, planned units and areas" },
  {
    id: "partners",
    label: "Partners",
    description: "Ownership, contributions and payment history",
  },
  { id: "estimate", label: "Estimate", description: "Estimated costs and expected recovery" },
  { id: "costs", label: "Costs", description: "Land, construction and other recorded costs" },
  { id: "sales", label: "Sales", description: "Sold units, buyers and agreed prices" },
  {
    id: "profit",
    label: "Profit & Loss",
    description: "Current result, partner allocations and payouts",
  },
] as const;
export type ReportSection = (typeof reportSections)[number]["id"];
export interface ProjectReportData {
  project: Project;
  building: ProjectBuildingDetails | null;
  land: ProjectLand | null;
  partners: ProjectPartnerRow[];
  contributions: Transaction[];
  estimates: ProjectEstimate[];
  costs: Transaction[];
  sales: ProjectSale[];
  payouts: PartnerPayout[];
}
const money = (value: number | null) => (value === null ? "Not recorded" : formatPKR(value));
function Table({ headers, rows }: { headers: string[]; rows: ReactNode[][] }) {
  return rows.length ? (
    <table>
      <thead>
        <tr>
          {headers.map((h) => (
            <th key={h}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={i}>
            {row.map((value, j) => (
              <td key={j}>{value ?? "—"}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  ) : (
    <p className="empty">No records saved for this section.</p>
  );
}
function Payments({ rows, partners }: { rows: Transaction[]; partners: ProjectPartnerRow[] }) {
  return (
    <Table
      headers={["Date", "Person / description", "Method / reference", "Amount"]}
      rows={rows.map((r) => [
        formatDate(r.date),
        [partners.find((p) => p.partner_id === r.partner_id)?.name, r.description]
          .filter(Boolean)
          .join(" · ") || r.type,
        [r.method, r.reference].filter(Boolean).join(" · "),
        money(r.amount),
      ])}
    />
  );
}
export function buildProjectReport(
  data: ProjectReportData,
  selected: ReportSection[],
  generatedAt = new Date(),
) {
  const {
    project,
    building: b,
    land,
    partners,
    contributions,
    estimates,
    costs,
    sales,
    payouts,
  } = data;
  const spent = costs.reduce((sum, r) => sum + r.amount, 0),
    sold = sales.reduce((sum, r) => sum + r.price, 0),
    result = sold - spent;
  const received = contributions.reduce((sum, r) => sum + r.amount, 0);
  const sections: Record<ReportSection, ReactNode> = {
    dashboard: (
      <>
        <p>
          {project.name} is {project.status || "at an unrecorded stage"}
          {project.location ? ` in ${project.location}` : ""}.{" "}
          {project.start_date
            ? `The recorded start date is ${formatDate(project.start_date)}.`
            : "No start date has been recorded."}
        </p>
        <p>{project.description || "No project description has been added."}</p>
        <Table
          headers={["Project measure", "Recorded value"]}
          rows={[
            ["Project code", project.code],
            ["Partners", partners.length],
            ["Partner contributions received", money(received)],
            ["Total recorded costs (including land)", money(spent)],
            ["Agreed sales", money(sold)],
            ["Current difference: agreed sales less costs", money(result)],
          ]}
        />
        <p>
          Amounts reflect saved records at the time this report was prepared. Agreed sales are sale
          values, not money collected.
        </p>
      </>
    ),
    building: (
      <>
        <p>
          {b
            ? `The planned building use is ${b.building_use || "not recorded"}. The tables below describe the saved building plan and land acquisition.`
            : "No building plan has been recorded yet."}
        </p>
        {land && (
          <>
            <h3>Land acquisition</h3>
            <Table
              headers={["Detail", "Value"]}
              rows={[
                ["Land", land.title],
                ["Location", land.location],
                ["Seller", land.seller_name],
                ["Purchase date", formatDate(land.purchase_date)],
                ["Area", `${land.area_value ?? "—"} ${land.area_unit ?? ""}`],
                ["Price", money(land.price)],
                ["Notes", land.notes],
              ]}
            />
          </>
        )}
        {b && (
          <>
            <h3>Building & areas</h3>
            <Table
              headers={["Detail", "Planned value"]}
              rows={[
                ["Floors above ground", b.floors_above_ground],
                ["Basements", b.basement_count],
                ["Flats", b.planned_flats],
                ["Shops", b.planned_shops],
                ["Offices", b.planned_offices],
                ["Houses", b.planned_houses],
                ["Parking spaces", b.planned_parking_spaces],
                ["Parking area", `${b.parking_area_value ?? "—"} ${b.parking_area_unit ?? ""}`],
                ["Plot area", `${b.plot_area_value ?? "—"} ${b.plot_area_unit ?? ""}`],
                ["Covered area", `${b.covered_area_sqft ?? "—"} sqft`],
                [
                  "Amenities",
                  decodeBuildingSpaces(b.selected_spaces_json).join(", ").replace(/_/g, " "),
                ],
                ["Notes", b.notes],
              ]}
            />
            <h3>Floor layout</h3>
            <Table
              headers={["Floor", "Flat type", "Count"]}
              rows={decodeFloorLayout(b.floor_layout_json).flatMap((f) =>
                f.flat_types.map((t) => [
                  f.floor_index === 0 ? "Ground floor" : `Floor ${f.floor_index}`,
                  `${t.rooms} rooms`,
                  t.count,
                ]),
              )}
            />
          </>
        )}
      </>
    ),
    partners: (
      <>
        <p>
          {partners.length} partners are recorded for this project. Contributions fund the project;
          they are not sales income. Ownership percentages determine illustrative allocations.
        </p>
        <Table
          headers={["Partner / phone", "Ownership", "Agreed contribution", "Received"]}
          rows={partners.map((p) => [
            [p.name, p.phone].filter(Boolean).join(" · "),
            `${(p.share_bp / 100).toFixed(2)}%`,
            money(p.agreed_contribution),
            money(p.contributed),
          ])}
        />
        <h3>Contribution history</h3>
        <Payments rows={contributions} partners={partners} />
      </>
    ),
    estimate: (
      <>
        <p>
          These are planning ranges, separate from payments already made. Expected recovery is not a
          recorded sale or collection.
        </p>
        {(["cost", "revenue"] as const).map((kind) => {
          const rows = estimates.filter((r) => r.kind === kind);
          return (
            <div key={kind}>
              <h3>{kind === "cost" ? "Estimated costs" : "Expected recovery"}</h3>
              <Table
                headers={["Item", "Details", "Minimum", "Maximum"]}
                rows={rows.map((r) => [
                  r.title,
                  r.details,
                  money(r.minimum_amount),
                  money(r.maximum_amount),
                ])}
              />
              <p>
                Total range: {money(rows.reduce((s, r) => s + r.minimum_amount, 0))} to{" "}
                {money(rows.reduce((s, r) => s + r.maximum_amount, 0))}.
              </p>
            </div>
          );
        })}
      </>
    ),
    costs: (
      <>
        <p>
          Total recorded project costs are {money(spent)} across {costs.length} entries. This
          includes saved land acquisition and construction costs, without counting partner payouts
          as project expenses.
        </p>
        <Payments rows={costs} partners={partners} />
      </>
    ),
    sales: (
      <>
        <p>
          {sales.length} unit sales have been recorded with a combined agreed value of {money(sold)}
          . These amounts represent sale agreements, not collections.
        </p>
        <Table
          headers={["Date / unit", "Buyer", "Contact / address", "Agreed price", "Notes"]}
          rows={sales.map((s) => [
            `${formatDate(s.sale_date)} · ${s.kind} ${s.unit_number}, ${s.floor_index === 0 ? "ground" : `floor ${s.floor_index}`}${s.rooms ? `, ${s.rooms} rooms` : ""}`,
            s.buyer_name,
            [s.buyer_phone, s.buyer_address].filter(Boolean).join(" · "),
            money(s.price),
            s.notes,
          ])}
        />
      </>
    ),
    profit: (
      <>
        <p>
          The current difference is {money(result)}: agreed sales of {money(sold)} less recorded
          costs of {money(spent)}. This is a planning view, not finalized cash profit. Collections,
          unpaid bills, unsold units and tax are not included.
        </p>
        <Table
          headers={[
            "Partner",
            "Ownership",
            "Illustrative allocation",
            "Capital returned",
            "Profit paid",
          ]}
          rows={partners.map((p) => [
            p.name,
            `${(p.share_bp / 100).toFixed(2)}%`,
            money(Math.trunc((result * p.share_bp) / 10000)),
            money(
              payouts
                .filter(
                  (r) => r.partner_id === p.partner_id && r.payout_purpose === "capital_return",
                )
                .reduce((s, r) => s + r.amount, 0),
            ),
            money(
              payouts
                .filter((r) => r.partner_id === p.partner_id && r.payout_purpose === "profit")
                .reduce((s, r) => s + r.amount, 0),
            ),
          ])}
        />
        <p>
          Unassigned / rounding balance:{" "}
          {money(
            result -
              partners.reduce((sum, p) => sum + Math.trunc((result * p.share_bp) / 10000), 0),
          )}
          . Allocations are estimates, not payments.
        </p>
        <h3>Actual partner payouts</h3>
        <Table
          headers={["Date", "Partner", "Purpose", "Method / reference", "Amount"]}
          rows={payouts.map((r) => [
            formatDate(r.date),
            partners.find((p) => p.partner_id === r.partner_id)?.name || "Unknown partner",
            r.payout_purpose === "profit" ? "Profit payout" : "Capital return",
            [r.method, r.reference].filter(Boolean).join(" · "),
            money(r.amount),
          ])}
        />
      </>
    ),
  };
  return (
    "<!doctype html>" +
    renderToStaticMarkup(
      <html lang="en">
        <head>
          <meta charSet="utf-8" />
          <title>{project.name} — Project report</title>
          <style>{reportStyles}</style>
        </head>
        <body>
          <header>
            <span>BALOCH BUILDERS & DEVELOPERS</span>
            <strong>PROJECT REPORT</strong>
          </header>
          <h1>{project.name}</h1>
          <p className="meta">
            {project.code || "No project code"} · {project.location || "Location not recorded"}
            <br />
            Prepared {generatedAt.toLocaleString("en-PK")} · {selected.length} selected sections
          </p>
          <p className="contents">
            Included:{" "}
            {reportSections
              .filter((s) => selected.includes(s.id))
              .map((s) => s.label)
              .join(" · ")}
          </p>
          {reportSections
            .filter((s) => selected.includes(s.id))
            .map((s, i) => (
              <section key={s.id}>
                <h2>
                  {String(i + 1).padStart(2, "0")} / {s.label}
                </h2>
                {sections[s.id]}
              </section>
            ))}
          <footer>End of project report · Baloch Builders & Developers</footer>
        </body>
      </html>,
    )
  );
}
const reportStyles = `
@page { size: A4; margin: 17mm 15mm 18mm; }
* { box-sizing: border-box; } body { margin: 0 auto; max-width: 180mm; color: #172c3b; background: white; font: 11pt/1.6 "Segoe UI",Arial,sans-serif; }
header { display:flex; justify-content:space-between; gap:20px; border-bottom:3px solid #b89046; padding:0 0 12px; font-size:9pt; letter-spacing:.06em; } h1 { font-size:26pt; margin:24px 0 8px; } h2 { font-size:18pt; border-bottom:1px solid #b89046; padding-bottom:10px; margin:24px 0 15px; } h3 { font-size:12pt; margin:20px 0 8px; } p { white-space:pre-wrap; overflow-wrap:anywhere; } .meta,footer { color:#526574; font-size:9pt; }.contents { padding:12px; border:1px solid #cbd5dc; font-size:10pt; } table { border-collapse:collapse; width:100%; table-layout:fixed; font-size:9pt; margin:12px 0 20px; } th,td { text-align:left; vertical-align:top; border:1px solid #cbd5dc; padding:9px; overflow-wrap:anywhere; white-space:pre-wrap; } th { background:#edf1f4; font-weight:700; } thead { display:table-header-group; } tr { break-inside:avoid; } h2,h3 { break-after:avoid; } p { orphans:3; widows:3; } footer { border-top:1px solid #cbd5dc; margin-top:25px; padding-top:12px; } section + section { break-before:page; } .empty { color:#526574; font-style:italic; }
@media screen { html { background:#e9edf2; padding:24px; } body { padding:20mm 15mm; max-width:210mm; box-shadow:0 3px 20px #0001; } section + section { margin-top:55px; border-top:2px dashed #cbd5dc; padding-top:15px; } }
`;

