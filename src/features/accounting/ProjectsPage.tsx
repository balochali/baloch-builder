import { entryError } from "./sheetMessages";
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
import { ProjectEntry } from "./ProjectEntry";
import { projectSummary } from "./projectSummary";
export function ProjectsPage({ user }: { user: SessionUser }) {
  const [creating, setCreating] = useState(false);
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
  ];
  const columns: ColDef<Row>[] = names.map((field) => ({
    field,
    headerName:
      field === "saleable_area_sqft"
        ? "Area " + (settings.areaDisplayUnit === "sqft" ? "sq ft" : settings.areaDisplayUnit)
        : (
            {
              code: "Code",
              name: "Project Name",
              type: "Type",
              city: "City",
              status: "Status",
              start_date: "Start",
              planned_end_date: "End",
              project_manager_id: "Manager",
            } as Record<string, string>
          )[field],
    minWidth: field === "name" ? 140 : field.includes("date") ? 100 : 75,
    flex: field === "name" ? 1.6 : 1,
    ...(field === "status"
      ? {
          cellClass: "project-status",
          valueFormatter: (p: { value: unknown }) => String(p.value ?? "").replace(/_/g, " "),
        }
      : {}),
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
    if (row._new || row[field] === oldValue) return;
    setError("");
    try {
      const p = await api<Row>(`projects/${row.id}`, "PATCH", {
        [field]: projectValue(field, row[field], settings, users),
      });
      setRows((values) => values.map((v) => (v.id === p.id ? p : v)));
    } catch (e) {
      setError(String(e));
      setRows((values) =>
        values.map((v) => (v.id === row.id ? { ...v, error: entryError(e) } : v)),
      );
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
        failed.push({ ...row, error: entryError(e) });
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
      {creating && (
        <ProjectEntry
          settings={settings}
          users={users}
          onCancel={() => setCreating(false)}
          onCreated={(project) => {
            setCreating(false);
            setRevision((v) => v + 1);
            if (project.id) navigate("/projects/" + project.id);
          }}
        />
      )}
      {error && <p role="alert">{error}</p>}
      <p className="sheet-hint">
        Click New Project for guided entry, or type in the blank row. Open a project to edit its
        details.
      </p>
      <Grid
        screen="projects"
        rows={[
          ...view,
          ...(admin
            ? draft.map((r) => ({ ...r, _new: true, _placeholder: !r.code && !r.name && !r.city }))
            : []),
        ]}
        columns={columns}
        newLabel={admin ? "New Project" : undefined}
        onNew={admin ? () => setCreating(true) : undefined}
        summary={(visible) => {
          const summary = projectSummary(visible);
          return (
            <>
              <span className="sheet-summary-label">Visible rows · includes unsaved entries</span>
              <span>
                Projects<strong>{summary.count}</strong>
              </span>
              <span>
                Active<strong>{summary.active}</strong>
              </span>
              <span>
                Unsaved<strong>{summary.drafts}</strong>
              </span>
              <span>
                Saleable Area ({settings.areaDisplayUnit})<strong>{summary.area}</strong>
              </span>
              {summary.excluded > 0 && (
                <span role="status">{summary.excluded} invalid area value(s) excluded</span>
              )}
            </>
          );
        }}
        emptyMessage="No projects yet. Click + New Project or type in the first row."
        toolbarContent={
          <label className="sheet-archive">
            <input
              type="checkbox"
              checked={archived}
              onChange={(e) => setArchived(e.target.checked)}
            />
            Show archived
          </label>
        }
        onChange={
          admin
            ? (values) => {
                const next = values
                  .filter((r) => r._new || !r.id)
                  .map((r) => ({ ...newProjectRow(), ...r }));
                const last = next[next.length - 1];
                setDraft(
                  last && !last.code && !last.name && !last.city
                    ? next
                    : [...next, newProjectRow()],
                );
              }
            : undefined
        }
        onCellChange={admin ? (r, f, o) => void edit(r, f, o) : undefined}
        onSelect={(r) => navigate("/projects/" + r.id)}
        onSave={
          admin && draft.some((r) => r.code || r.name || r.city) ? () => void create() : undefined
        }
        busy={busy}
      />
    </div>
  );
}
