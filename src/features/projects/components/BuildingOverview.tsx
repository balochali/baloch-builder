import {
  Building2,
  BriefcaseBusiness,
  CarFront,
  Droplets,
  House,
  Layers3,
  Ruler,
  ShieldCheck,
  Store,
  Sun,
  Zap,
  type LucideIcon,
} from "lucide-react";
import type { ProjectBuildingDetails } from "@/domain/types";
import type { BuildingSpace } from "@/data/repositories/projectBuildingRepository";

type Props = { details: ProjectBuildingDetails; selectedSpaces: BuildingSpace[] };

const facilities: {
  key: BuildingSpace;
  title: string;
  description: string;
  icon: LucideIcon;
  color: string;
}[] = [
  {
    key: "parking",
    title: "Parking",
    description: "Space for vehicles",
    icon: CarFront,
    color: "blue",
  },
  {
    key: "masjid",
    title: "Masjid",
    description: "Prayer space included",
    icon: Building2,
    color: "green",
  },
  {
    key: "lift",
    title: "Lift",
    description: "Access between floors",
    icon: Layers3,
    color: "purple",
  },
  {
    key: "rooftop",
    title: "Rooftop",
    description: "Rooftop space planned",
    icon: Sun,
    color: "orange",
  },
  {
    key: "water_tank",
    title: "Water tank",
    description: "Water storage planned",
    icon: Droplets,
    color: "cyan",
  },
  {
    key: "generator",
    title: "Generator",
    description: "Backup power planned",
    icon: Zap,
    color: "yellow",
  },
  {
    key: "fire_safety",
    title: "Fire safety",
    description: "Safety provision planned",
    icon: ShieldCheck,
    color: "rose",
  },
];

function SpacePlanGraphic({ details }: { details: ProjectBuildingDetails }) {
  const spaces = [
    { label: "Flats", count: details.planned_flats ?? 0, icon: House, color: "blue" },
    { label: "Shops", count: details.planned_shops ?? 0, icon: Store, color: "orange" },
    {
      label: "Offices",
      count: details.planned_offices ?? 0,
      icon: BriefcaseBusiness,
      color: "green",
    },
    { label: "Houses", count: details.planned_houses ?? 0, icon: Building2, color: "purple" },
  ].filter((space) => space.count > 0);
  const total = spaces.reduce((sum, space) => sum + space.count, 0);
  return (
    <section className="building-space-plan" aria-labelledby="building-space-plan-title">
      <div className="building-space-plan-head">
        <div>
          <h3 id="building-space-plan-title">What is being built</h3>
          <p>Each color shows one type of planned unit.</p>
        </div>
        <div className="building-space-plan-total">
          <strong>{total.toLocaleString()}</strong>
          <span>total units</span>
        </div>
      </div>
      <div
        className="building-space-plan-strip"
        role="img"
        aria-label={spaces.map(({ count, label }) => `${count} ${label.toLowerCase()}`).join(", ")}
      >
        {spaces.map(({ label, count, color }) => (
          <span key={label} className={`is-${color}`} style={{ flexGrow: count }} />
        ))}
      </div>
      <div className="building-space-plan-list">
        {spaces.map(({ label, count, icon: Icon, color }) => (
          <div className={`building-space-plan-row is-${color}`} key={label}>
            <span className="building-space-plan-icon">
              <Icon size={21} aria-hidden="true" />
            </span>
            <div className="building-space-plan-row-main">
              <div className="building-space-plan-row-label">
                <strong>{label}</strong>
                <span>
                  {count.toLocaleString()} of {total.toLocaleString()} units
                </span>
              </div>
              <div className="building-space-plan-row-track">
                <span style={{ width: `${(count / total) * 100}%` }} />
              </div>
            </div>
            <strong className="building-space-plan-count">
              {Math.round((count / total) * 100)}%
            </strong>
          </div>
        ))}
      </div>
    </section>
  );
}

export function BuildingOverview({ details, selectedSpaces }: Props) {
  const units = [
    details.planned_flats,
    details.planned_shops,
    details.planned_offices,
    details.planned_houses,
  ].reduce<number>((sum, value) => sum + Math.max(0, value ?? 0), 0);
  const floors = details.floors_above_ground;
  const basements = details.basement_count ?? 0;
  const areaUnit = details.covered_area_unit === "sqyd" ? "sq yd" : "sq ft";
  const area =
    details.covered_area_sqft == null
      ? null
      : details.covered_area_unit === "sqyd"
        ? details.covered_area_sqft / 9
        : details.covered_area_sqft;
  const use =
    details.building_use === "mixed-use"
      ? "Mixed use"
      : details.building_use
        ? details.building_use[0].toUpperCase() + details.building_use.slice(1)
        : "Not specified";
  const included = facilities.filter(
    (item) =>
      selectedSpaces.includes(item.key) ||
      (item.key === "masjid" && details.has_masjid === 1) ||
      (item.key === "parking" && details.parking_area_value != null),
  );
  const metrics = [
    {
      label: "Planned units",
      value: units ? units.toLocaleString() : "Not added",
      note: "Flats, shops, offices & houses",
      icon: House,
      color: "blue",
    },
    {
      label: "Floors",
      value: floors == null ? "Not added" : String(floors),
      note: basements
        ? `Including ground · ${basements} basement${basements === 1 ? "" : "s"}`
        : "Including ground floor",
      icon: Layers3,
      color: "purple",
    },
    {
      label: "Building use",
      value: use,
      note: "Purpose of this building",
      icon: Store,
      color: "orange",
    },
    {
      label: "Covered area",
      value: area == null ? "Not added" : `${Math.round(area).toLocaleString()} ${areaUnit}`,
      note: "Total planned covered area",
      icon: Ruler,
      color: "green",
    },
  ];

  return (
    <div className="building-glance">
      <div className="building-glance-intro">
        <span className="building-glance-intro-icon">
          <Building2 size={24} aria-hidden="true" />
        </span>
        <div>
          <h3>Your building plan</h3>
          <p>
            {units
              ? `${units.toLocaleString()} planned ${units === 1 ? "unit" : "units"}`
              : "Add planned units"}
            {floors != null ? ` across ${floors} ${floors === 1 ? "floor" : "floors"}` : ""}. See
            the breakdown and included facilities below.
          </p>
        </div>
      </div>
      <div className="building-glance-metrics">
        {metrics.map(({ label, value, note, icon: Icon, color }) => (
          <div key={label} className={`building-glance-metric is-${color}`}>
            <span className="building-glance-metric-icon">
              <Icon size={22} aria-hidden="true" />
            </span>
            <span className="building-glance-metric-label">{label}</span>
            <strong>{value}</strong>
            <small>{note}</small>
          </div>
        ))}
      </div>
      <div className="building-glance-panels">
        <div className="building-glance-mix">
          {units ? (
            <SpacePlanGraphic details={details} />
          ) : (
            <div className="building-glance-empty">
              <span>
                <House size={25} />
              </span>
              <h3>Space mix</h3>
              <p>
                Add the number of flats, shops, offices or houses to see how the building is
                divided.
              </p>
            </div>
          )}
        </div>
        <section className="building-glance-facilities" aria-labelledby="building-facilities-title">
          <div className="building-glance-panel-heading">
            <span>
              <ShieldCheck size={21} />
            </span>
            <div>
              <h3 id="building-facilities-title">Facilities in the plan</h3>
              <p>Features selected for this building</p>
            </div>
          </div>
          {included.length ? (
            <div className="building-glance-facility-list">
              {included.map(({ key, title, description, icon: Icon, color }) => (
                <div key={key} className={`building-glance-facility is-${color}`}>
                  <span>
                    <Icon size={20} aria-hidden="true" />
                  </span>
                  <div>
                    <strong>{title}</strong>
                    <small>
                      {key === "parking" && details.parking_area_value != null
                        ? `${details.parking_area_value.toLocaleString()} ${details.parking_area_unit === "sqyd" ? "sq yd" : "sq ft"} planned`
                        : description}
                    </small>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="building-glance-facilities-empty">
              No facilities selected yet. Add them in Edit Details to see them here.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
