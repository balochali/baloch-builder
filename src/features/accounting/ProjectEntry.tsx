import { useState } from "react";
import { areaToSqft, projectTypes, type AreaSettings, type AreaUnit } from "@baloch/shared";
import { api } from "@/data/api";
import { newProjectRow, validateNewProject } from "./projectGridModel";
import { entryError } from "./sheetMessages";
import type { Row } from "./Grid";

export function ProjectEntry({
  settings,
  users,
  onCreated,
  onCancel,
}: {
  settings: AreaSettings;
  users: Row[];
  onCreated: (project: Row) => void;
  onCancel: () => void;
}) {
  const [entry, setEntry] = useState<Row>(newProjectRow);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [unit, setUnit] = useState<AreaUnit | "sqyd">(settings.areaDisplayUnit);
  const field = (key: string, value: string) => setEntry((row) => ({ ...row, [key]: value }));
  return (
    <form
      className="project-entry"
      aria-label="Create project"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError("");
        try {
          const converted = { ...entry };
          for (const key of ["land_area_sqft", "saleable_area_sqft"]) {
            const value = String(entry[key] ?? "").trim();
            converted[key] = value
              ? areaToSqft(
                  value,
                  unit === "sqyd" ? "marla" : unit,
                  unit === "sqyd" ? "9" : settings.marlaSqft,
                )
              : "";
          }
          const body = validateNewProject(
            converted,
            { ...settings, areaDisplayUnit: "sqft" },
            users,
          );
          const project = await api<Row>("projects", "POST", body);
          onCreated(project);
        } catch (cause) {
          setError(entryError(cause));
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="project-entry-heading">
        <h3>New Project</h3>
        <p>Start with the basics. Add buildings and further details in the project profile.</p>
      </div>
      <fieldset disabled={busy}>
        <label>
          Area Unit
          <select
            value={unit}
            onChange={(e) => setUnit(e.target.value as AreaUnit | "sqyd")}
            disabled={Boolean(entry.land_area_sqft || entry.saleable_area_sqft)}
          >
            <option value="sqft">Square feet</option>
            <option value="sqyd">Square yards</option>
            <option value="marla">Marla</option>
            <option value="kanal">Kanal</option>
          </select>
          <small>Choose before entering areas.</small>
        </label>
        <label>
          Project Code
          <input
            autoFocus
            required
            value={String(entry.code)}
            onChange={(e) => field("code", e.target.value)}
            placeholder="e.g. BB-001"
          />
        </label>
        <label>
          Project Name
          <input
            required
            value={String(entry.name)}
            onChange={(e) => field("name", e.target.value)}
            placeholder="e.g. Baloch Heights"
          />
        </label>
        <label>
          City
          <input
            required
            value={String(entry.city)}
            onChange={(e) => field("city", e.target.value)}
            placeholder="e.g. Karachi"
          />
        </label>
        <label>
          Project Type
          <select value={String(entry.type)} onChange={(e) => field("type", e.target.value)}>
            {projectTypes.map((type) => (
              <option key={type} value={type}>
                {type.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        </label>
        <label>
          Land Area ({unit})
          <input
            inputMode="decimal"
            value={String(entry.land_area_sqft ?? "")}
            onChange={(e) => field("land_area_sqft", e.target.value)}
          />
        </label>
        <label>
          Saleable Area ({unit})
          <input
            inputMode="decimal"
            value={String(entry.saleable_area_sqft ?? "")}
            onChange={(e) => field("saleable_area_sqft", e.target.value)}
          />
        </label>
        <label>
          Start Date
          <input
            type="date"
            value={String(entry.start_date)}
            onChange={(e) => field("start_date", e.target.value)}
          />
        </label>
        <label>
          Planned End Date
          <input
            type="date"
            value={String(entry.planned_end_date)}
            onChange={(e) => field("planned_end_date", e.target.value)}
          />
        </label>
      </fieldset>
      {error && <p role="alert">{error}</p>}
      <div className="project-entry-actions">
        <button type="button" disabled={busy} onClick={onCancel}>
          Cancel
        </button>
        <button className="sheet-primary" disabled={busy} type="submit">
          {busy ? "Creating…" : "Create & Open Project"}
        </button>
      </div>
    </form>
  );
}
