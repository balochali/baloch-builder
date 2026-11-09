import { useEffect, useRef, useState } from "react";
import { Building2 } from "lucide-react";
import {
  amenities,
  buildingSchema,
  buildingTypes,
  floorUses,
  structureTypes,
  unitCategories,
  type Project,
  type SiteBuilding,
} from "@baloch/shared";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { api } from "@/data/api";
import { FeasibilityGrid, numberCell, numericValue, type Cell } from "./FeasibilityGrid";
import { formatPercent } from "./feasibilityFormat";
import { areaNumber, totalLandArea, type SiteData } from "./projectSite";

type Floor = SiteBuilding["floors"][number];
type Unit = SiteBuilding["units"][number];
type SyncValues = { name: string; count: number; area: number };
type Preview = { token: string; changes: { before: SyncValues | null; after: SyncValues }[] };
const floorRow = (label = ""): Floor => ({
  id: crypto.randomUUID(),
  label,
  use: "Flats",
  unitCount: 0,
  floorAreaSqft: 0,
  notes: "",
});
const unitRow = (): Unit => ({
  id: crypto.randomUUID(),
  category: "Flat",
  name: "",
  count: 0,
  sizeSqft: 0,
  bedrooms: 0,
  bathrooms: 0,
  kitchens: 0,
  lounges: 0,
  balconies: 0,
  floorsText: "",
  notes: "",
});
const choices = (value: string, options: readonly string[]): Cell => ({ value, choices: options });
const roomKeys = ["bedrooms", "bathrooms", "kitchens", "lounges", "balconies"] as const;
function ordinal(value: number) {
  const suffix =
    value % 100 >= 11 && value % 100 <= 13
      ? "th"
      : (({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[value % 10] ?? "th");
  return value + suffix;
}
function generateFloors(building: SiteBuilding): Floor[] {
  const labels = [
    ...Array.from({ length: building.basements }, (_, i) => ({
      key: "basement-" + i,
      label: building.basements === 1 ? "Basement" : "Basement " + (i + 1),
    })),
    ...(building.floorsAboveGround ? [{ key: "ground", label: "Ground" }] : []),
    ...(building.hasMezzanine ? [{ key: "mezzanine", label: "Mezzanine" }] : []),
    ...Array.from({ length: Math.max(0, building.floorsAboveGround - 1) }, (_, i) => ({
      key: "floor-" + i,
      label: ordinal(i + 1),
    })),
  ];
  const generated = labels.map(
    ({ key, label }) =>
      building.floors.find((f) => f.generatedKey === key) ?? {
        ...floorRow(label),
        generatedKey: key,
        use: key.startsWith("basement") ? ("Parking" as const) : ("Flats" as const),
      },
  );
  const manual = building.floors
    .filter(
      (f) =>
        !f.generatedKey ||
        (!labels.some((l) => l.key === f.generatedKey) &&
          (f.unitCount || f.floorAreaSqft || f.notes)),
    )
    .map((f) => ({ ...f, generatedKey: undefined }));
  return [...generated, ...manual];
}
function applyRows<T>(
  rows: T[],
  changes: { row: number; col: number; value: string }[],
  create: () => T,
  edit: (item: T, col: number, value: string) => T,
) {
  const next = [...rows];
  for (const { row, col, value } of changes) {
    while (next.length <= row) next.push(create());
    next[row] = edit(next[row], col, value);
  }
  return next;
}
export function ProjectBuilding({
  project,
  site,
  manage,
  onSite,
  onSynced,
  feasibilityPending = false,
}: {
  project: Project;
  site: SiteData;
  manage: boolean;
  onSite: (update: (site: SiteData) => SiteData) => void;
  onSynced: () => void;
  feasibilityPending?: boolean;
}) {
  const [building, setBuilding] = useState(site.building);
  const [status, setStatus] = useState("Saved");
  const [error, setError] = useState("");
  const [syncError, setSyncError] = useState("");
  const [preview, setPreview] = useState<Preview>();
  const [syncing, setSyncing] = useState(false);
  const [synced, setSynced] = useState(false);
  const current = useRef(site.building);
  const dirty = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const queue = useRef(Promise.resolve(true));
  const alive = useRef(false);
  const endpoint = `projects/${project.id}/site`;
  const flush = useRef<() => Promise<boolean>>(async () => true);
  useEffect(() => {
    alive.current = true;
    flush.current = () => {
      clearTimeout(timer.current);
      if (!dirty.current) return queue.current;
      const snapshot = current.current;
      dirty.current = false;
      queue.current = queue.current.then(async () => {
        if (alive.current) setStatus("Saving...");
        try {
          const saved = await api<SiteBuilding>(
            endpoint + "/building",
            "PUT",
            buildingSchema.parse(snapshot),
          );
          onSite((site) => ({ ...site, building: saved }));
          if (alive.current && current.current === snapshot) {
            current.current = saved;
            setBuilding(saved);
            setStatus("Saved");
            setError("");
          }
          return true;
        } catch (cause) {
          if (current.current === snapshot) dirty.current = true;
          if (alive.current) {
            setStatus("Not saved");
            setError(String(cause));
          }
          return false;
        }
      });
      return queue.current;
    };
    return () => {
      alive.current = false;
      void flush.current();
    };
  }, [endpoint, onSite]);
  function update(change: (value: SiteBuilding) => SiteBuilding) {
    if (!manage || syncing) return;
    const next = change(current.current);
    current.current = next;
    setBuilding(next);
    setStatus("Unsaved");
    setError("");
    setSynced(false);
    dirty.current = true;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush.current(), 550);
  }
  function field<K extends keyof SiteBuilding>(key: K, value: SiteBuilding[K]) {
    update((b) => ({ ...b, [key]: value }));
  }
  function floorSetting<K extends "floorsAboveGround" | "basements" | "hasMezzanine">(
    key: K,
    value: SiteBuilding[K],
  ) {
    update((b) => {
      const next = { ...b, [key]: value };
      return { ...next, floors: generateFloors(next) };
    });
  }
  async function sync(token?: string) {
    setSyncing(true);
    setSyncError("");
    setSynced(false);
    try {
      if (!(await flush.current())) throw new Error("Save the building before syncing.");
      const result = await api<Preview>(endpoint + "/sync-sales", "POST", token ? { token } : {});
      if (token) {
        setPreview(undefined);
        setSynced(true);
        onSynced();
      } else setPreview(result);
    } catch (cause) {
      setSyncError(String(cause));
      if (token) setPreview(undefined);
    } finally {
      setSyncing(false);
    }
  }
  const locked = !manage || syncing;
  const categories =
    building.buildingType === "Residential flats only"
      ? unitCategories.filter((c) => c !== "Shop")
      : unitCategories;
  const count = building.units.reduce((sum, u) => sum + u.count, 0);
  const floorUnits = building.floors.reduce((sum, f) => sum + f.unitCount, 0);
  const saleable = building.units.reduce((sum, u) => sum + u.count * u.sizeSqft, 0);
  const covered =
    building.coveredAreaOverride ??
    building.coveredAreaPerFloor *
      (building.floorsAboveGround + building.basements + Number(building.hasMezzanine));
  const land = site.parcels.length
    ? `${areaNumber(totalLandArea(site.parcels, "Marla"))} Marla`
    : project.landArea
      ? `${areaNumber(project.landArea.value)} ${project.landArea.unit}`
      : "—";
  const display = (v: SyncValues) =>
    `${v.name} · ${v.count} units · ${areaNumber(v.area)} sq ft each`;
  return (
    <section className="project-site">
      <div className="project-section-heading">
        <h2>Building</h2>
        <span role="status" className="project-status">
          {status}
        </span>
      </div>
      {error && (
        <p role="alert" className="project-save-error">
          {error}{" "}
          <button className="projects-secondary" onClick={() => void flush.current()}>
            Retry save
          </button>
        </p>
      )}
      <section className="project-detail-panel">
        <h3>
          <Building2 size={18} /> Building summary
        </h3>
        <dl className="feasibility-metrics">
          {[
            ["Total units", areaNumber(count)],
            [
              "Flats count",
              areaNumber(
                building.units
                  .filter((u) => u.category === "Flat")
                  .reduce((sum, u) => sum + u.count, 0),
              ),
            ],
            [
              "Shops count",
              areaNumber(
                building.units
                  .filter((u) => u.category === "Shop")
                  .reduce((sum, u) => sum + u.count, 0),
              ),
            ],
            ["Total built-up area", areaNumber(covered) + " sq ft"],
            [
              "Floors",
              areaNumber(
                building.floorsAboveGround + building.basements + Number(building.hasMezzanine),
              ),
            ],
          ].map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
        <p className="site-building-stats">
          Saleable area <strong>{areaNumber(saleable)} sq ft</strong> · Efficiency{" "}
          <strong>{formatPercent(covered ? (saleable / covered) * 100 : null)}</strong>
        </p>
        <ul className="site-breakdown">
          {unitCategories.map((category) => {
            const units = building.units.filter((u) => u.category === category);
            return (
              <li key={category}>
                {category}: {areaNumber(units.reduce((sum, u) => sum + u.count, 0))} units /{" "}
                {areaNumber(units.reduce((sum, u) => sum + u.count * u.sizeSqft, 0))} sq ft
              </li>
            );
          })}
        </ul>
      </section>
      <section className="project-detail-panel">
        <div className="project-section-heading">
          <h3>Unit types</h3>
          {manage && (
            <button
              className="projects-primary"
              disabled={syncing || feasibilityPending || !building.units.length}
              onClick={() => void sync()}
            >
              Sync to feasibility sales
            </button>
          )}
        </div>
        {feasibilityPending && manage && (
          <p>Wait for Feasibility to finish saving before syncing.</p>
        )}
        {syncError && (
          <p role="alert" className="project-save-error">
            {syncError}
          </p>
        )}
        {synced && (
          <p role="status">
            Feasibility sales updated. Existing rates and sold percentages were preserved.
          </p>
        )}
        <FeasibilityGrid
          emptyMessage="Add a row for each distinct unit size or layout."
          locked={locked}
          headers={[
            "Category",
            "Type name",
            "Count",
            "Size (sq ft)",
            "Bedrooms",
            "Bathrooms",
            "Kitchens",
            "Lounge",
            "Balconies",
            "Floors located",
            "Notes",
          ]}
          rows={building.units.map((u) => ({
            id: u.id,
            cells: [
              choices(u.category, categories),
              { value: u.name },
              numberCell(u.count, 1e6, true),
              numberCell(u.sizeSqft, 1e12),
              ...roomKeys.map((key) =>
                u.category === "Flat"
                  ? numberCell(u[key], 1e6, true)
                  : { value: "", readOnly: true, numeric: true },
              ),
              { value: u.floorsText },
              { value: u.notes },
            ],
          }))}
          onAdd={() => update((b) => ({ ...b, units: [...b.units, unitRow()] }))}
          onDelete={(index) =>
            update((b) => ({ ...b, units: b.units.filter((_, i) => i !== index) }))
          }
          onChange={(changes) =>
            update((b) => ({
              ...b,
              units: applyRows(b.units, changes, unitRow, (row, col, value) => {
                if (col === 0) return { ...row, category: value as Unit["category"] };
                if (col === 1) return { ...row, name: value };
                if (col === 2) return { ...row, count: numericValue(value) };
                if (col === 3) return { ...row, sizeSqft: numericValue(value) };
                if (col >= 4 && col <= 8)
                  return row.category === "Flat"
                    ? { ...row, [roomKeys[col - 4]]: numericValue(value) }
                    : row;
                return { ...row, [col === 9 ? "floorsText" : "notes"]: value };
              }),
            }))
          }
        />
      </section>
      <details className="project-detail-panel funding-details">
        <summary>Building details</summary>
        <fieldset className="project-form-grid site-building-fields" disabled={locked}>
          <label>
            Building name
            <Input
              value={building.name}
              maxLength={500}
              onChange={(e) => field("name", e.target.value)}
            />
          </label>
          <label>
            Building type
            <select
              value={building.buildingType}
              onChange={(e) => {
                const type = e.target.value as SiteBuilding["buildingType"];
                if (
                  type === "Residential flats only" &&
                  building.units.some((u) => u.category === "Shop")
                ) {
                  setError("Change the shop rows before choosing residential flats only.");
                  return;
                }
                field("buildingType", type);
              }}
            >
              {buildingTypes.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </label>
          <label>
            Total land area
            <Input value={land} readOnly />
          </label>
          <label>
            Floors above ground (including Ground)
            <Input
              type="number"
              min={0}
              max={100}
              value={building.floorsAboveGround}
              onChange={(e) =>
                floorSetting(
                  "floorsAboveGround",
                  Math.max(0, Math.min(100, Math.floor(Number(e.target.value)))),
                )
              }
            />
          </label>
          <label>
            Basements
            <Input
              type="number"
              min={0}
              max={20}
              value={building.basements}
              onChange={(e) =>
                floorSetting(
                  "basements",
                  Math.max(0, Math.min(20, Math.floor(Number(e.target.value)))),
                )
              }
            />
          </label>
          <div className="site-checks">
            <label>
              <input
                type="checkbox"
                checked={building.hasMezzanine}
                onChange={(e) => floorSetting("hasMezzanine", e.target.checked)}
              />{" "}
              Mezzanine
            </label>
            <label>
              <input
                type="checkbox"
                checked={building.hasRoof}
                onChange={(e) => field("hasRoof", e.target.checked)}
              />{" "}
              Roof / terrace
            </label>
          </div>
          <label>
            Covered area per typical floor (sq ft)
            <Input
              type="number"
              min={0}
              step="any"
              value={building.coveredAreaPerFloor}
              onChange={(e) => field("coveredAreaPerFloor", Math.max(0, Number(e.target.value)))}
            />
          </label>
          <label>
            Total covered area override (sq ft)
            <Input
              type="number"
              min={0}
              step="any"
              value={building.coveredAreaOverride ?? ""}
              placeholder={areaNumber(covered)}
              onChange={(e) =>
                field(
                  "coveredAreaOverride",
                  e.target.value === "" ? undefined : Math.max(0, Number(e.target.value)),
                )
              }
            />
          </label>
          <label>
            Lifts
            <Input
              type="number"
              min={0}
              value={building.lifts}
              onChange={(e) => field("lifts", Math.max(0, Math.floor(Number(e.target.value))))}
            />
          </label>
          <label>
            Parking spaces
            <Input
              type="number"
              min={0}
              value={building.parkingSpaces}
              onChange={(e) =>
                field("parkingSpaces", Math.max(0, Math.floor(Number(e.target.value))))
              }
            />
          </label>
          <label>
            Structure type
            <select
              value={building.structureType}
              onChange={(e) =>
                field("structureType", e.target.value as SiteBuilding["structureType"])
              }
            >
              {structureTypes.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </label>
          <label>
            Approval or plan reference
            <Input
              value={building.approvalRef}
              maxLength={500}
              onChange={(e) => field("approvalRef", e.target.value)}
            />
          </label>
          <label className="project-full">
            Notes
            <textarea
              value={building.notes}
              maxLength={500}
              onChange={(e) => field("notes", e.target.value)}
            />
          </label>
          <div className="project-full">
            <strong>Amenities</strong>
            <div className="site-chips">
              {amenities.map((item) => (
                <button
                  type="button"
                  key={item}
                  className="projects-secondary"
                  aria-pressed={building.amenities.includes(item)}
                  onClick={() =>
                    field(
                      "amenities",
                      building.amenities.includes(item)
                        ? building.amenities.filter((value) => value !== item)
                        : [...building.amenities, item],
                    )
                  }
                >
                  {item}
                </button>
              ))}
            </div>
          </div>
        </fieldset>
      </details>
      <details className="project-detail-panel funding-details">
        <summary>Floor plan</summary>
        <FeasibilityGrid
          emptyMessage="Set the floor count in Building details or add a row below."
          headers={["Floor label", "Use", "Number of units", "Floor area (sq ft)", "Notes"]}
          locked={locked}
          rows={building.floors.map((f) => ({
            id: f.id,
            cells: [
              { value: f.label },
              choices(f.use, floorUses),
              numberCell(f.unitCount, 1e6, true),
              numberCell(f.floorAreaSqft, 1e12),
              { value: f.notes },
            ],
          }))}
          onAdd={() => update((b) => ({ ...b, floors: [...b.floors, floorRow()] }))}
          onDelete={(index) =>
            update((b) => ({ ...b, floors: b.floors.filter((_, i) => i !== index) }))
          }
          onChange={(changes) =>
            update((b) => ({
              ...b,
              floors: applyRows(b.floors, changes, floorRow, (row, col, value) => {
                if (col === 0) return { ...row, label: value };
                if (col === 1) return { ...row, use: value as Floor["use"] };
                if (col === 2) return { ...row, unitCount: numericValue(value) };
                if (col === 3) return { ...row, floorAreaSqft: numericValue(value) };
                return { ...row, notes: value };
              }),
            }))
          }
        />
        {floorUnits !== count && (
          <p role="status" className="project-share-warning">
            Floor plan has {floorUnits} units and unit types total {count}. You can save and
            reconcile them later.
          </p>
        )}
      </details>
      {preview && (
        <Dialog
          open
          onOpenChange={(open) => {
            if (!open && !syncing) setPreview(undefined);
          }}
        >
          <DialogContent className="project-detail-dialog">
            <DialogTitle>Review feasibility sales changes</DialogTitle>
            <DialogDescription>
              Only unit names, counts and sizes will change. Existing rates and sold percentages
              will be kept.
            </DialogDescription>
            <ul className="site-sync-preview">
              {preview.changes.map(({ before, after }) => (
                <li key={after.name + ":" + after.area}>
                  <strong>
                    {before ? "Update" : "Add"} {after.name}
                  </strong>
                  <p>
                    {before ? display(before) + " → " : ""}
                    {display(after)}
                  </p>
                </li>
              ))}
            </ul>
            <div className="project-modal-actions">
              <button
                className="projects-secondary"
                disabled={syncing}
                onClick={() => setPreview(undefined)}
              >
                Cancel
              </button>
              <button
                className="projects-primary"
                disabled={syncing || feasibilityPending}
                onClick={() => void sync(preview.token)}
              >
                {syncing ? "Syncing..." : "Confirm sync"}
              </button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </section>
  );
}
