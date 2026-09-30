import { RingChart } from "@/components/charts/RingChart";
import { TimeSeriesChart, chartColors } from "@/components/charts/TimeSeriesChart";
import type { ReactNode } from "react";
import type { ProjectBuildingDetails, ProjectEstimate, Transaction } from "@/domain/types";
import { formatCompact, formatPKR } from "@/domain/money";
import type { ProjectPartnerRow } from "@/data/repositories/projectPartnersRepository";
import { decodeFloorLayout } from "@/data/repositories/projectBuildingRepository";
import type { ProjectLand } from "@/data/repositories/projectStageRepository";

const colors = [
  chartColors.blue,
  chartColors.gold,
  chartColors.green,
  chartColors.purple,
  chartColors.coral,
];

function ChartCard({
  title,
  hint,
  children,
}: {
  title: string;
  hint: string;
  children: ReactNode;
}) {
  return (
    <div className="insight-card">
      <div className="insight-heading">
        <h3>{title}</h3>
        <p>{hint}</p>
      </div>
      {children}
    </div>
  );
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
  const largest = values.reduce((current, item) => (item.value > current.value ? item : current));
  const largestPercent = Math.round((largest.value / total) * 100);
  return (
    <ChartCard title="What is being built" hint="Planned spaces by type">
      <div className="building-mix-layout">
        <RingChart
          value={total}
          label="spaces"
          ariaLabel={values.map((item) => item.value + " " + item.label.toLowerCase()).join(", ")}
          segments={values.map((item, index) => ({ ...item, color: colors[index] }))}
        />
        <div className="building-mix-breakdown">
          {values.map((item, index) => (
            <div className="building-mix-row" key={item.label}>
              <div className="building-mix-label">
                <span>
                  <i style={{ background: colors[index] }} />
                  {item.label}
                </span>
                <strong>
                  {item.value} <small>({Math.round((item.value / total) * 100)}%)</small>
                </strong>
              </div>
              <div
                className="building-mix-track"
                role="img"
                aria-label={`${item.label}: ${item.value} of ${total} planned spaces`}
              >
                <span
                  style={{ width: `${(item.value / total) * 100}%`, background: colors[index] }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="building-mix-takeaway">
        <strong>At a glance</strong>
        <p>
          {values.length === 1
            ? `All ${total} planned spaces are ${largest.label.toLowerCase()}.`
            : `${largest.label} make up the largest part of the plan: ${largest.value} of ${total} spaces (${largestPercent}%).`}
        </p>
      </div>
    </ChartCard>
  );
}

export function BuildingLevelsChart({ details }: { details: ProjectBuildingDetails }) {
  const floors = Math.max(0, details.floors_above_ground ?? 0);
  const basements = Math.max(0, details.basement_count ?? 0);
  if (!floors && !basements) return null;
  const shownFloors = Math.min(floors, 6);
  const shownBasements = Math.min(basements, 2);
  const floorLayout = decodeFloorLayout(details.floor_layout_json ?? "[]");
  const floorUnitCount = (floorIndex: number) =>
    floorLayout
      .find((floor) => floor.floor_index === floorIndex)
      ?.flat_types.reduce((total, type) => total + type.count, 0) ?? 0;
  return (
    <ChartCard
      title="How tall is the plan?"
      hint="A simple view of the planned floors and basements."
    >
      <div className="building-levels-layout">
        <div
          className="building-levels-visual"
          role="img"
          aria-label={`${floors} ${floors === 1 ? "floor" : "floors"} above ground and ${basements} ${basements === 1 ? "basement" : "basements"} planned`}
        >
          <div className="building-roof">
            <span>{details.building_use?.replace("-", " ") || "Building"}</span>
          </div>
          {floors > shownFloors && (
            <span className="building-levels-extra">+ {floors - shownFloors} more floors</span>
          )}
          {Array.from({ length: shownFloors }, (_, index) => {
            const floorIndex = floors - index - 1;
            const units = floorUnitCount(floorIndex);
            return (
              <div key={`floor-${floorIndex}`} className="building-level above">
                <span>{floorIndex === 0 ? "Ground" : `Floor ${floorIndex}`}</span>
                <span className="building-level-units">
                  {units ? `${units} flat${units === 1 ? "" : "s"}` : ""}
                </span>
                <i />
                <i />
                <i />
              </div>
            );
          })}
          <div className="building-ground-line" />
          {Array.from({ length: shownBasements }, (_, index) => (
            <div key={`basement-${index}`} className="building-level below">
              <span>Basement {index + 1}</span>
              <i />
              <i />
              <i />
            </div>
          ))}
          {basements > shownBasements && (
            <span className="building-levels-extra">
              + {basements - shownBasements} more basements
            </span>
          )}
        </div>
        <div className="building-levels-summary">
          <div>
            <strong>{floors}</strong>
            <span>{floors === 1 ? "floor" : "floors"} above ground</span>
          </div>
          <div>
            <strong>{basements}</strong>
            <span>{basements === 1 ? "basement" : "basements"} planned</span>
          </div>
          <p>The ground floor is included in the floor count.</p>
        </div>
      </div>
    </ChartCard>
  );
}

export function BuildingAreaChart({
  details,
  land,
}: {
  details: ProjectBuildingDetails | null;
  land: ProjectLand | null;
}) {
  const plot = land?.area_value ?? null;
  const covered = details?.covered_area_sqft ?? null;
  const parking = details?.parking_area_value ?? null;
  if (plot === null && covered === null && parking === null && !land) return null;
  const plotComparable =
    land?.area_unit === "sqyd" && plot !== null
      ? plot * 9
      : land?.area_unit === "sqft"
        ? plot
        : null;
  const parkingComparable =
    details?.parking_area_unit === "sqyd" && parking !== null ? parking * 9 : parking;
  const rows = [
    ...(plot !== null
      ? [
          {
            label: "Acquired land area",
            value: plotComparable,
            display: `${plot.toLocaleString()} ${land?.area_unit === "sqyd" ? "sq yd" : land?.area_unit === "sqft" ? "sq ft" : (land?.area_unit ?? "")}`,
            color: "#d8a72f",
          },
        ]
      : []),
    ...(covered !== null
      ? [
          {
            label: "Planned covered area",
            value: covered,
            display: `${covered.toLocaleString()} sq ft`,
            color: "#256aa3",
          },
        ]
      : []),
    ...(parking !== null
      ? [
          {
            label: "Planned parking area",
            value: parkingComparable,
            display: `${parking.toLocaleString()} ${details?.parking_area_unit === "sqyd" ? "sq yd" : "sq ft"}`,
            color: "#4a9bb8",
          },
        ]
      : []),
  ];
  const max = Math.max(...rows.map((row) => row.value ?? 0), 1);
  return (
    <ChartCard
      title="Land and building areas"
      hint="Bars compare areas after converting square yards to square feet. Other land units are shown without a comparison bar."
    >
      <div className="building-area-chart">
        {rows.map((item) => (
          <div className="building-area-row" key={item.label}>
            <div>
              <strong>{item.label}</strong>
              <span>{item.display}</span>
            </div>
            {item.value !== null && (
              <div
                className="building-area-track"
                role="img"
                aria-label={`${item.label}: ${item.display}`}
              >
                <span style={{ width: `${(item.value / max) * 100}%`, background: item.color }} />
              </div>
            )}
          </div>
        ))}
      </div>
      {land && (
        <div className="chart-takeaway">
          <strong>Land acquired</strong>
          <p>
            {land.title} · {land.location} · {land.purchase_date}
            {land.price !== null ? ` · Purchase price ${formatPKR(land.price)}` : ""}
            {land.seller_name ? ` · Seller ${land.seller_name}` : ""}
          </p>
        </div>
      )}
    </ChartCard>
  );
}

export function FlatLayoutChart({ details }: { details: ProjectBuildingDetails }) {
  const floors = decodeFloorLayout(details.floor_layout_json ?? "[]").filter(
    (floor) => floor.flat_types.length > 0,
  );
  if (!floors.length) return null;
  const totalFlats = floors.reduce(
    (total, floor) => total + floor.flat_types.reduce((sum, type) => sum + type.count, 0),
    0,
  );
  const roomCounts = [
    ...new Set(floors.flatMap((floor) => floor.flat_types.map((type) => type.rooms))),
  ]
    .sort((a, b) => a - b)
    .map((rooms) => ({
      rooms,
      count: floors.reduce(
        (total, floor) =>
          total +
          floor.flat_types
            .filter((type) => type.rooms === rooms)
            .reduce((sum, type) => sum + type.count, 0),
        0,
      ),
    }));
  const roomColor = (rooms: number) =>
    rooms === 2 ? "#3179af" : rooms === 3 ? "#e3aa34" : rooms === 1 ? "#50a88d" : "#826ac0";
  return (
    <section className="flat-layout-visual">
      <div className="flat-layout-heading">
        <div>
          <h3>Flat layout by floor</h3>
          <p>A simple visual of how many flats of each size are planned on every floor.</p>
        </div>
        <span>
          {totalFlats} flats across {floors.length} {floors.length === 1 ? "floor" : "floors"}
        </span>
      </div>
      <div className="flat-layout-overview">
        <div className="flat-layout-total">
          <strong>{totalFlats}</strong>
          <span>planned flats</span>
        </div>
        <div className="flat-layout-mix">
          <strong>Flat sizes in the building</strong>
          <div
            className="flat-layout-mix-track"
            role="img"
            aria-label={roomCounts
              .map((item) => `${item.count} ${item.rooms}-room flats`)
              .join(", ")}
          >
            {roomCounts.map((item) => (
              <span
                key={item.rooms}
                style={{
                  width: `${(item.count / totalFlats) * 100}%`,
                  background: roomColor(item.rooms),
                }}
              />
            ))}
          </div>
          <div className="flat-layout-legend">
            {roomCounts.map((item) => (
              <span key={item.rooms}>
                <i style={{ background: roomColor(item.rooms) }} />
                <b>{item.count}</b> {item.rooms}-room
              </span>
            ))}
          </div>
        </div>
      </div>
      <div className="flat-floor-grid">
        {floors.map((floor) => {
          const flatCount = floor.flat_types.reduce((total, type) => total + type.count, 0);
          return (
            <article
              className="flat-floor-card"
              key={floor.floor_index}
              role="img"
              aria-label={`${floor.floor_index === 0 ? "Ground floor" : `Floor ${floor.floor_index}`}: ${floor.flat_types.map((type) => `${type.count} ${type.rooms}-room flat${type.count === 1 ? "" : "s"}`).join(", ")}`}
            >
              <div className="flat-floor-title">
                <span>
                  {floor.floor_index === 0 ? "Ground floor" : `Floor ${floor.floor_index}`}
                </span>
                <strong>
                  {flatCount} {flatCount === 1 ? "flat" : "flats"}
                </strong>
              </div>
              <div className="flat-floor-strip" aria-hidden="true">
                {floor.flat_types.map((type) => (
                  <span
                    key={type.rooms}
                    style={{
                      width: `${(type.count / flatCount) * 100}%`,
                      background: roomColor(type.rooms),
                    }}
                  />
                ))}
              </div>
              <div className="flat-units">
                {floor.flat_types.flatMap((type) =>
                  Array.from({ length: type.count }, (_, index) => (
                    <div
                      className="flat-unit"
                      key={`${type.rooms}-${index}`}
                      style={{ borderColor: roomColor(type.rooms) }}
                    >
                      <span className="flat-unit-number">
                        Flat{" "}
                        {String(
                          floor.flat_types
                            .filter((entry) => entry.rooms < type.rooms)
                            .reduce((sum, entry) => sum + entry.count, 0) +
                            index +
                            1,
                        ).padStart(2, "0")}
                      </span>
                      <span className="flat-unit-room" style={{ color: roomColor(type.rooms) }}>
                        <strong>{type.rooms}</strong>
                        <small>{type.rooms === 1 ? "room" : "rooms"}</small>
                      </span>
                      <span className="flat-unit-windows" aria-hidden="true">
                        {Array.from({ length: Math.min(type.rooms, 5) }, (_, room) => (
                          <i key={room} style={{ background: roomColor(type.rooms) }} />
                        ))}
                      </span>
                    </div>
                  )),
                )}
              </div>
              <div className="flat-floor-summary">
                {floor.flat_types.map((type) => (
                  <span key={type.rooms}>
                    <i style={{ background: roomColor(type.rooms) }} />
                    {type.count} {type.rooms}-room {type.count === 1 ? "flat" : "flats"}
                  </span>
                ))}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

export function OwnershipChart({ partners }: { partners: { name: string; share_bp: number }[] }) {
  if (!partners.length) return null;
  const allocated = partners.reduce((sum, item) => sum + item.share_bp, 0);
  const values = [
    ...partners.map((item) => ({ label: item.name, value: item.share_bp })),
    ...(allocated < 10_000 ? [{ label: "Unallocated", value: 10_000 - allocated }] : []),
  ];
  const largest = [...partners].sort((a, b) => b.share_bp - a.share_bp)[0];
  return (
    <ChartCard
      title="Who owns what?"
      hint="Each colored slice is one partner's share of this project."
    >
      <div className="donut-layout">
        <RingChart
          value={(allocated / 100).toFixed(0) + "%"}
          label="assigned"
          ariaLabel={values
            .map((item) => item.label + " " + (item.value / 100).toFixed(2) + " percent")
            .join(", ")}
          segments={values.map((item, index) => ({
            ...item,
            color: colors[index % colors.length],
            display: (item.value / 100).toFixed(2) + "%",
          }))}
        />
        <div className="chart-legend">
          {values.map((item, index) => (
            <div key={index}>
              <span>
                <i style={{ background: colors[index % colors.length] }} />
                {item.label}
              </span>
              <strong>{(item.value / 100).toFixed(item.value % 100 ? 2 : 0)}%</strong>
            </div>
          ))}
        </div>
      </div>
      <div className="chart-takeaway">
        <strong>What this means</strong>
        <p>
          {allocated === 10_000
            ? "The full project share has been assigned to partners."
            : `${((10_000 - allocated) / 100).toFixed(2)}% of the project share has not been assigned yet.`}{" "}
          {largest.name} has the largest share at{" "}
          {(largest.share_bp / 100).toFixed(largest.share_bp % 100 ? 2 : 0)}%.
        </p>
      </div>
    </ChartCard>
  );
}

export function PartnerFundingChart({ partners }: { partners: ProjectPartnerRow[] }) {
  const committed = partners.filter((partner) => partner.agreed_contribution !== null);
  if (!partners.length) return null;
  if (!committed.length)
    return (
      <ChartCard
        title="Money promised and received"
        hint="See how much each partner has paid and what is still due."
      >
        <div className="chart-takeaway">
          <strong>No payment target recorded</strong>
          <p>
            These partners have no agreed contribution amount saved. Payments can still be recorded,
            but there is no target to compare them with.
          </p>
        </div>
      </ChartCard>
    );
  const received = committed.reduce((sum, partner) => sum + partner.contributed, 0);
  const remaining = committed.reduce(
    (sum, partner) => sum + Math.max(0, (partner.agreed_contribution ?? 0) - partner.contributed),
    0,
  );
  return (
    <ChartCard
      title="Money promised and received"
      hint="Green shows money received. The pale coral remainder is still due."
    >
      <div className="partner-funding-totals">
        <div>
          <span>Received</span>
          <strong>{formatPKR(received)}</strong>
        </div>
        <div>
          <span>Remaining</span>
          <strong>{formatPKR(remaining)}</strong>
        </div>
      </div>
      <div className="partner-funding-list">
        {committed.map((partner) => {
          const target = partner.agreed_contribution ?? 0;
          const due = Math.max(0, target - partner.contributed);
          const percent = target > 0 ? Math.min(100, (partner.contributed / target) * 100) : 100;
          return (
            <div className="partner-funding-row" key={partner.partnership_id}>
              <div className="partner-funding-line">
                <strong>{partner.name}</strong>
                <span>
                  {formatCompact(partner.contributed)} of {formatCompact(target)} received
                </span>
              </div>
              <div
                className="partner-funding-track"
                role="img"
                aria-label={`${partner.name}: ${formatPKR(partner.contributed)} received, ${formatPKR(due)} remaining`}
              >
                <div style={{ width: `${percent}%` }} />
              </div>
              <p>
                {due > 0
                  ? `${formatPKR(due)} still to receive`
                  : partner.contributed > target
                    ? `${formatPKR(partner.contributed - target)} above the agreed amount`
                    : "Fully received"}
              </p>
            </div>
          );
        })}
      </div>
      {committed.length < partners.length && (
        <p className="insight-note">Remaining excludes partners who have no agreed amount saved.</p>
      )}
    </ChartCard>
  );
}

export function EstimateChart({ items, title }: { items: ProjectEstimate[]; title: string }) {
  if (!items.length) return null;
  const displayed = [...items].sort((a, b) => b.maximum_amount - a.maximum_amount).slice(0, 6);
  const max = Math.max(...displayed.map((item) => item.maximum_amount), 1);
  return (
    <ChartCard title={title} hint="Compare each item's estimate on the same rupee scale.">
      <div className="viz-inline-legend">
        <span>
          <i style={{ background: "#3986e8" }} />
          Minimum estimate
        </span>
        <span>
          <i style={{ background: "#b7d6fc" }} />
          Up to maximum
        </span>
      </div>
      <div className="estimate-chart">
        {displayed.map((item) => (
          <div className="estimate-chart-row" key={item.id}>
            <div className="estimate-chart-label">
              <strong title={item.title}>{item.title}</strong>
              <span>
                {formatPKR(item.minimum_amount)} – {formatPKR(item.maximum_amount)}
              </span>
            </div>
            <div
              className="estimate-chart-track"
              role="img"
              aria-label={`${item.title}: ${formatPKR(item.minimum_amount)} to ${formatPKR(item.maximum_amount)}`}
            >
              <div
                className="estimate-chart-max"
                style={{ width: `${(item.maximum_amount / max) * 100}%` }}
              />
              <div
                className="estimate-chart-min"
                style={{ width: `${(item.minimum_amount / max) * 100}%` }}
              />
            </div>
          </div>
        ))}
        <div className="viz-comparison-scale">
          <span>Rs 0</span>
          <span>{formatPKR(Math.round(max / 2))}</span>
          <span>{formatPKR(max)}</span>
        </div>
        {items.length > 6 && (
          <p className="insight-note">
            Showing the six largest items. All items remain listed below.
          </p>
        )}
      </div>
    </ChartCard>
  );
}

export function SpendingChart({ costs }: { costs: Transaction[] }) {
  if (!costs.length) return null;
  const byDate = new Map<string, number>();
  for (const cost of costs) byDate.set(cost.date, (byDate.get(cost.date) ?? 0) + cost.amount);
  const dates = [...byDate.keys()].sort();
  let running = 0;
  const points = [];
  for (const key of dates) {
    running += byDate.get(key) ?? 0;
    points.push({ key, values: { spent: running } });
  }
  return (
    <ChartCard title="Spending over time" hint="Running total of recorded project costs">
      <div className="spending-total">
        <strong>{formatPKR(running)}</strong>
        <span>spent so far</span>
      </div>
      <TimeSeriesChart
        points={points}
        series={[{ key: "spent", label: "Total spent", color: chartColors.blue }]}
        ariaLabel={"Spending rose to " + formatPKR(running) + " by " + dates[dates.length - 1]}
        caption="Each point includes payments through that date. Dates are spaced to reflect elapsed time."
      />
    </ChartCard>
  );
}
