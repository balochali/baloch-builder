import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { ColDef } from "ag-grid-community";
import { defaultAreaSettings, projectTypes, type AreaSettings } from "@baloch/shared";
import type { SessionUser } from "@/data/session";
import { api } from "@/data/api";
import { Grid, type Row } from "./Grid";
import { SearchSelectEditor } from "./SearchSelectEditor";
import {
  newProjectRow,
  projectValue,
  displayProjectValue,
  validateNewProject,
} from "./projectGridModel";
import "./accounting.css";
export function ProjectsPage({ user }: { user: SessionUser }) {
  const navigate = useNavigate();
  const [rows, setRows] = useState<Row[]>([]),
    [draft, setDraft] = useState<Row[]>([newProjectRow()]),
    [users, setUsers] = useState<Row[]>([]);
  const [settings, setSettings] = useState<AreaSettings>(defaultAreaSettings),
    [archived, setArchived] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    Promise.all([
      api<Row[]>(`projects?includeArchived=${archived}`),
      api<AreaSettings>("area-settings"),
      user.role === "admin" ? api<Row[]>("users") : Promise.resolve([]),
    ])
      .then(([p, s, u]) => {
        if (active) {
          setRows(p);
          setSettings(s);
          setUsers(u.filter((u) => u.active));
        }
      })
      .catch((e) => {
        if (active) setError(String(e));
      });
    return () => {
      active = false;
    };
  }, [archived, user.role, revision]);
  const admin = user.role === "admin";
  const names = [
    "code",
    "name",
    "type",
    "city",
    "status",
    "start_date",
    "planned_end_date",
    "project_manager_id",
    "saleable_area_sqft",
    "assigned_user_count",
  ];
  const columns: ColDef<Row>[] = names.map((field) => ({
    field,
    headerName:
      field === "saleable_area_sqft"
        ? `Saleable area (${settings.areaDisplayUnit})`
        : field === "project_manager_id"
          ? "Project manager"
          : field.replace(/_/g, " "),
    editable: admin && !busy && !["status", "assigned_user_count"].includes(field),
    ...(field === "type"
      ? { cellEditor: "agSelectCellEditor", cellEditorParams: { values: [...projectTypes] } }
      : {}),
    ...(field === "project_manager_id"
      ? {
          cellEditor: SearchSelectEditor,
          cellEditorParams: {
            choices: users.map((u) => ({ value: String(u.email), label: String(u.role) })),
          },
        }
      : {}),
  }));
  const view = rows.map((r) => ({
    ...r,
    saleable_area_sqft: displayProjectValue(r, "saleable_area_sqft", settings),
    project_manager_id: displayProjectValue(r, "project_manager_id", settings),
  }));
  async function edit(row: Row, field: string, oldValue: unknown) {
    if (row[field] === oldValue) return;
    setError("");
    try {
      const p = await api<Row>(`projects/${row.id}`, "PATCH", {
        [field]: projectValue(field, row[field], settings, users),
      });
      setRows((values) => values.map((v) => (v.id === p.id ? p : v)));
    } catch (e) {
      setError(String(e));
      setRows((values) => values.map((v) => (v.id === row.id ? { ...v, error: String(e) } : v)));
    }
  }
  async function create() {
    setBusy(true);
    setError("");
    const failed: Row[] = [];
    for (const row of draft.filter(
      (r) =>
        String(r.code ?? "").trim() || String(r.name ?? "").trim() || String(r.city ?? "").trim(),
    )) {
      try {
        await api("projects", "POST", validateNewProject(row, settings, users));
      } catch (e) {
        failed.push({ ...row, error: String(e) });
      }
    }
    setDraft([...failed, newProjectRow()]);
    setRevision((v) => v + 1);
    if (failed.length) setError("Correct the marked project rows");
    setBusy(false);
  }
  return (
    <div className="accounting-workspace">
      <h2>Projects</h2>
      {error && <p role="alert">{error}</p>}
      <label>
        <input type="checkbox" checked={archived} onChange={(e) => setArchived(e.target.checked)} />{" "}
        Show archived projects
      </label>
      <p>
        Double-click a project to open its Profile workspace. Areas: {settings.areaDisplayUnit}; 1
        marla = {settings.marlaSqft} sqft, 1 kanal = 20 marla.
      </p>
      <Grid
        screen="projects"
        rows={view}
        columns={[
          ...columns,
          { field: "archived", editable: false },
          { field: "error", editable: false },
        ]}
        onCellChange={admin ? (r, f, o) => void edit(r, f, o) : undefined}
        onSelect={(r) => navigate(`/projects/${r.id}`)}
      />
      {admin && (
        <section>
          <h3>Add projects</h3>
          <Grid
            short
            screen="projects-new"
            rows={draft}
            columns={[
              ...columns.filter((c) => !["assigned_user_count", "status"].includes(c.field ?? "")),
              { field: "error", editable: false },
            ]}
            onChange={(r) => setDraft(r)}
          />
          <button onClick={() => setDraft((v) => [...v, newProjectRow()])}>Add row</button>
          <button disabled={busy} onClick={() => void create()}>
            Save new projects
          </button>
        </section>
      )}
    </div>
  );
}
