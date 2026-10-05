import {
  ArrowUpRight,
  CalendarDays,
  CarFront,
  FileText,
  Landmark,
  MapPin,
  MapPinned,
  Ruler,
  UserRound,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { Link } from "react-router-dom";
import type { ProjectBuildingDetails } from "@/domain/types";
import type { ProjectLand } from "@/data/repositories/projectStageRepository";
import { formatPKR } from "@/domain/money";
import { formatDate } from "@/lib/dates";

type Props = { details: ProjectBuildingDetails; land: ProjectLand | null };
type Measure = {
  label: string;
  value: number;
  unit: string;
  sqft: number | null;
  icon: LucideIcon;
  color: string;
  description: string;
};

export function BuildingAreasOverview({ details, land }: Props) {
  const plotValue = land?.area_value ?? details.plot_area_value;
  const plotUnit = land?.area_unit ?? details.plot_area_unit;
  const coveredSqft = details.covered_area_sqft;
  const coveredUnit = details.covered_area_unit === "sqyd" ? "sq yd" : "sq ft";
  const parkingValue = details.parking_area_value;
  const parkingUnit = details.parking_area_unit === "sqyd" ? "sq yd" : "sq ft";
  const measures: Measure[] = [
    ...(plotValue != null
      ? [
          {
            label: "Land plot",
            value: plotValue,
            unit: plotUnit === "sqyd" ? "sq yd" : plotUnit === "sqft" ? "sq ft" : (plotUnit ?? ""),
            sqft: plotUnit === "sqyd" ? plotValue * 9 : plotUnit === "sqft" ? plotValue : null,
            icon: MapPinned,
            color: "purple",
            description: "Acquired land area",
          },
        ]
      : []),
    ...(coveredSqft != null
      ? [
          {
            label: "Covered area",
            value: details.covered_area_unit === "sqyd" ? coveredSqft / 9 : coveredSqft,
            unit: coveredUnit,
            sqft: coveredSqft,
            icon: Ruler,
            color: "blue",
            description: "Total planned area across the building",
          },
        ]
      : []),
    ...(parkingValue != null
      ? [
          {
            label: "Parking area",
            value: parkingValue,
            unit: parkingUnit,
            sqft: details.parking_area_unit === "sqyd" ? parkingValue * 9 : parkingValue,
            icon: CarFront,
            color: "green",
            description: "Space planned for parking",
          },
        ]
      : []),
  ];
  const comparable = measures.filter((item) => item.sqft != null);
  const max = Math.max(1, ...comparable.map((item) => item.sqft ?? 0));
  const hasOtherDetails =
    details.planned_parking_spaces != null || details.has_masjid === 1 || Boolean(details.notes);

  return (
    <div className="building-areas-overview">
      <div className="building-areas-hero">
        <span>
          <Ruler size={25} aria-hidden="true" />
        </span>
        <div>
          <h3>Areas & plan details</h3>
          <p>Measurements saved for this building, with their original units shown clearly.</p>
        </div>
      </div>
      {measures.length ? (
        <div className="building-areas-metrics">
          {measures.map(({ label, value, unit, icon: Icon, color, description }) => (
            <div className={`building-areas-metric is-${color}`} key={label}>
              <span>
                <Icon size={23} aria-hidden="true" />
              </span>
              <small>{label}</small>
              <strong>{`${Number(value.toFixed(2)).toLocaleString()} ${unit}`}</strong>
              <p>{description}</p>
            </div>
          ))}
        </div>
      ) : (
        <div className="building-areas-empty">
          No area measurements saved yet. Use Edit Details to add covered or parking area.
        </div>
      )}
      {comparable.length > 1 && (
        <section
          className="building-areas-comparison"
          aria-labelledby="building-area-comparison-title"
        >
          <div className="building-areas-section-heading">
            <h3 id="building-area-comparison-title">Compare area sizes</h3>
            <p>Measurements are converted to square feet for this visual comparison.</p>
          </div>
          <div className="building-areas-comparison-list">
            {comparable.map(({ label, value, unit, sqft, color }) => (
              <div className={`building-areas-comparison-row is-${color}`} key={label}>
                <div>
                  <strong>{label}</strong>
                  <span>
                    {Number(value.toFixed(2)).toLocaleString()} {unit}
                  </span>
                </div>
                <div
                  className="building-areas-comparison-track"
                  role="img"
                  aria-label={`${label}: ${Number(value.toFixed(2)).toLocaleString()} ${unit}`}
                >
                  <span style={{ width: `${((sqft ?? 0) / max) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
          <p className="building-areas-comparison-note">
            Covered area may span multiple floors, so it can be larger than the land plot. These
            bars compare sizes; they do not show portions of one area.
          </p>
        </section>
      )}
      {land && (
        <section className="building-land-purchase" aria-labelledby="building-land-purchase-title">
          <div className="building-land-purchase-head">
            <span>
              <Landmark size={23} aria-hidden="true" />
            </span>
            <div>
              <h3 id="building-land-purchase-title">Land purchase</h3>
              <p>{land.title}</p>
            </div>
            <Link to="/land">
              View land records <ArrowUpRight size={16} aria-hidden="true" />
            </Link>
          </div>
          <div className="building-land-purchase-grid">
            <div>
              <span>
                <UserRound size={19} aria-hidden="true" />
              </span>
              <small>Bought from</small>
              <strong>{land.seller_name || "Not recorded"}</strong>
            </div>
            <div>
              <span>
                <Wallet size={19} aria-hidden="true" />
              </span>
              <small>Purchase price</small>
              <strong>{land.price == null ? "Not recorded" : formatPKR(land.price)}</strong>
            </div>
            <div>
              <span>
                <CalendarDays size={19} aria-hidden="true" />
              </span>
              <small>Purchase date</small>
              <strong>{formatDate(land.purchase_date)}</strong>
            </div>
            <div>
              <span>
                <MapPin size={19} aria-hidden="true" />
              </span>
              <small>Location</small>
              <strong>{land.location || "Not recorded"}</strong>
            </div>
          </div>
          {land.notes && <p className="building-land-purchase-note">{land.notes}</p>}
        </section>
      )}
      {hasOtherDetails && (
        <section className="building-areas-extras" aria-labelledby="building-plan-details-title">
          <div className="building-areas-section-heading">
            <h3 id="building-plan-details-title">Other saved details</h3>
            <p>Additional notes from the building plan.</p>
          </div>
          <div className="building-areas-extra-grid">
            {details.planned_parking_spaces != null && (
              <div>
                <CarFront size={20} aria-hidden="true" />
                <span>Parking spaces</span>
                <strong>{details.planned_parking_spaces}</strong>
              </div>
            )}
            {details.has_masjid === 1 && (
              <div>
                <Landmark size={20} aria-hidden="true" />
                <span>Masjid</span>
                <strong>Included</strong>
              </div>
            )}
          </div>
          {details.notes && (
            <div className="building-areas-note">
              <FileText size={20} aria-hidden="true" />
              <div>
                <strong>Plan notes</strong>
                <p>{details.notes}</p>
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
