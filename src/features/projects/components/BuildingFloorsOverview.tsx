import { Building2, DoorOpen, Layers3, LayoutGrid, Warehouse } from "lucide-react";
import { decodeFloorLayout } from "@/data/repositories/projectBuildingRepository";
import type { ProjectBuildingDetails } from "@/domain/types";

const roomColors = ["#0891b2", "#377cf4", "#e99b18", "#7950e8", "#db527f"];
const roomColor = (rooms: number) =>
  roomColors[Math.min(Math.max(rooms - 1, 0), roomColors.length - 1)];
const floorName = (index: number) => (index === 0 ? "Ground floor" : `Floor ${index}`);

export function BuildingFloorsOverview({ details }: { details: ProjectBuildingDetails }) {
  const floorCount = Math.max(0, details.floors_above_ground ?? 0);
  const basements = Math.max(0, details.basement_count ?? 0);
  const layouts = decodeFloorLayout(details.floor_layout_json ?? "[]");
  const flatCount = layouts.reduce(
    (sum, floor) => sum + floor.flat_types.reduce((count, type) => count + type.count, 0),
    0,
  );
  const sizeMix = [
    ...new Set(layouts.flatMap((floor) => floor.flat_types.map((type) => type.rooms))),
  ]
    .sort((a, b) => a - b)
    .map((rooms) => ({
      rooms,
      count: layouts.reduce(
        (sum, floor) =>
          sum +
          floor.flat_types
            .filter((type) => type.rooms === rooms)
            .reduce((count, type) => count + type.count, 0),
        0,
      ),
    }));
  const floors = Array.from({ length: floorCount }, (_, index) => ({
    index,
    layout: layouts.find((floor) => floor.floor_index === index),
  })).reverse();

  return (
    <div className="building-floors-overview">
      <div className="building-floors-hero">
        <span className="building-floors-hero-icon">
          <Layers3 size={26} aria-hidden="true" />
        </span>
        <div>
          <h3>Floors & flat plan</h3>
          <p>See the building from top to ground, then explore what is planned on each floor.</p>
        </div>
      </div>
      <div className="building-floors-stats">
        <div className="is-purple">
          <Layers3 size={23} aria-hidden="true" />
          <strong>{floorCount}</strong>
          <span>floors including ground</span>
        </div>
        <div className="is-blue">
          <DoorOpen size={23} aria-hidden="true" />
          <strong>{flatCount}</strong>
          <span>flats in the floor plan</span>
        </div>
        <div className="is-orange">
          <Warehouse size={23} aria-hidden="true" />
          <strong>{basements}</strong>
          <span>{basements === 1 ? "basement" : "basements"} planned</span>
        </div>
      </div>
      <div className="building-floors-main">
        <section className="building-floors-elevation" aria-labelledby="building-elevation-title">
          <div className="building-floors-section-title">
            <Building2 size={21} aria-hidden="true" />
            <div>
              <h3 id="building-elevation-title">Building at a glance</h3>
              <p>Each level shows its planned flat count.</p>
            </div>
          </div>
          <div
            className="building-floors-stack"
            role="img"
            aria-label={`${floorCount} ${floorCount === 1 ? "floor" : "floors"} above ground and ${basements} ${basements === 1 ? "basement" : "basements"} planned`}
          >
            <div className="building-floors-roof">
              {details.building_use?.replace("-", " ") || "Building plan"}
            </div>
            {floors.map(({ index, layout }) => {
              const count = layout?.flat_types.reduce((sum, type) => sum + type.count, 0) ?? 0;
              return (
                <div className="building-floors-level" key={index}>
                  <span>{floorName(index)}</span>
                  <div className="building-floors-windows" aria-hidden="true">
                    {Array.from({ length: Math.min(Math.max(count, 1), 8) }, (_, window) => (
                      <i key={window} />
                    ))}
                  </div>
                  <strong>{count ? `${count} flats` : "No flats"}</strong>
                </div>
              );
            })}
            <div className="building-floors-ground" />
            {Array.from({ length: basements }, (_, index) => (
              <div className="building-floors-basement" key={index}>
                Basement {index + 1}
              </div>
            ))}
          </div>
        </section>
        <section className="building-floors-mix" aria-labelledby="building-flat-mix-title">
          <div className="building-floors-section-title">
            <LayoutGrid size={21} aria-hidden="true" />
            <div>
              <h3 id="building-flat-mix-title">Flat sizes</h3>
              <p>How the planned flats are divided by rooms.</p>
            </div>
          </div>
          {flatCount ? (
            <>
              <div
                className="building-floors-mix-track"
                role="img"
                aria-label={sizeMix
                  .map(({ count, rooms }) => `${count} ${rooms}-room flats`)
                  .join(", ")}
              >
                {sizeMix.map(({ rooms, count }) => (
                  <span key={rooms} style={{ flexGrow: count, background: roomColor(rooms) }} />
                ))}
              </div>
              <div className="building-floors-mix-list">
                {sizeMix.map(({ rooms, count }) => (
                  <div key={rooms}>
                    <i style={{ background: roomColor(rooms) }} />
                    <span>{rooms}-room flats</span>
                    <strong>{count}</strong>
                    <small>{Math.round((count / flatCount) * 100)}%</small>
                  </div>
                ))}
              </div>
              <p className="building-floors-mix-note">
                {flatCount} planned {flatCount === 1 ? "flat" : "flats"} across{" "}
                {layouts.filter((floor) => floor.flat_types.length).length}{" "}
                {layouts.filter((floor) => floor.flat_types.length).length === 1
                  ? "floor"
                  : "floors"}
                .
              </p>
            </>
          ) : (
            <p className="building-floors-empty">
              Add flat types to the building details to see the size mix here.
            </p>
          )}
        </section>
      </div>
      <section
        className="building-floors-by-level"
        aria-labelledby="building-floor-breakdown-title"
      >
        <div className="building-floors-breakdown-heading">
          <div>
            <h3 id="building-floor-breakdown-title">Floor by floor</h3>
            <p>Flat types planned on each level, starting from the ground floor.</p>
          </div>
          <span>{floorCount} levels</span>
        </div>
        {floorCount ? (
          <div className="building-floors-cards">
            {[...floors].reverse().map(({ index, layout }) => {
              const count = layout?.flat_types.reduce((sum, type) => sum + type.count, 0) ?? 0;
              return (
                <article
                  className="building-floors-card"
                  key={index}
                  role="img"
                  aria-label={`${floorName(index)}: ${layout?.flat_types.length ? layout.flat_types.map((type) => `${type.count} ${type.rooms}-room flat${type.count === 1 ? "" : "s"}`).join(", ") : "no flats planned"}`}
                >
                  <div className="building-floors-card-head">
                    <span className="building-floors-card-number">
                      {index === 0 ? "G" : String(index).padStart(2, "0")}
                    </span>
                    <div>
                      <h4>{floorName(index)}</h4>
                      <p>
                        {count
                          ? `${count} planned ${count === 1 ? "flat" : "flats"}`
                          : "No flats assigned"}
                      </p>
                    </div>
                    <strong>
                      {count} {count === 1 ? "flat" : "flats"}
                    </strong>
                  </div>
                  {count ? (
                    <div className="building-floors-room-list">
                      {layout?.flat_types.map((type) => (
                        <div key={type.rooms}>
                          <span style={{ background: roomColor(type.rooms) }}>
                            <DoorOpen size={17} aria-hidden="true" />
                          </span>
                          <strong>{type.rooms}-room</strong>
                          <small>
                            {type.count} {type.count === 1 ? "flat" : "flats"}
                          </small>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="building-floors-card-empty">
                      Flat details can be added in Edit Details.
                    </p>
                  )}
                </article>
              );
            })}
          </div>
        ) : (
          <p className="building-floors-empty">
            Add the number of floors in Edit Details to see them here.
          </p>
        )}
      </section>
    </div>
  );
}
