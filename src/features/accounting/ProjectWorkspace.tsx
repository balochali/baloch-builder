import { useEffect, useState, useRef } from "react";
import { Link, useParams } from "react-router-dom";
import {
  defaultAreaSettings,
  projectTypes,
  type AreaSettings,
  type ProjectStatus,
  type WorkbookSheet,
} from "@baloch/shared";
import type { SessionUser } from "@/data/session";
import { api } from "@/data/api";
import { ProjectRegister } from "./ProjectRegister";
import { Grid, type Row } from "./Grid";
import { AssignedUsersGrid } from "./AssignedUsersGrid";
import { BuildingsGrid } from "./BuildingsGrid";
import { ProjectStatusControl } from "./ProjectStatusControl";
import { SearchSelectEditor } from "./SearchSelectEditor";
import {
  profileLabels,
  areaFields,
  canEditProfile,
  displayProjectValue,
  projectValue,
} from "./projectGridModel";
import "./accounting.css";
export const projectTabs = [
  "Overview",
  "Estimate",
  "Partners",
  "Construction",
  "Flats",
  "Sales",
  "Buildings",
  "Team",
  "History",
] as const;
export function ProjectWorkspace({ user }: { user: SessionUser }) {
  const { id = "" } = useParams();
  const [project, setProject] = useState<Row | null>(null),
    [settings, setSettings] = useState<AreaSettings>(defaultAreaSettings),
    [users, setUsers] = useState<Row[]>([]),
    [history, setHistory] = useState<Row[]>([]),
    [error, setError] = useState(""),
    [revision, setRevision] = useState(0),
    [busy, setBusy] = useState(false);
  const pending = useRef(Promise.resolve());
  const [tab, setTab] = useState<(typeof projectTabs)[number]>("Overview");
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    if (!dirty) return;
    const prevent = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", prevent);
    return () => window.removeEventListener("beforeunload", prevent);
  }, [dirty]);
  useEffect(() => {
    let active = true;
    Promise.all([
      api<Row>(`projects/${id}`),
      api<AreaSettings>("area-settings"),
      api<Row[]>(`projects/${id}/status-history`),
      user.role === "admin" ? api<Row[]>("users") : Promise.resolve([]),
    ])
      .then(([p, s, h, u]) => {
        if (active) {
          setProject(p);
          setSettings(s);
          setHistory(h);
          setUsers(u.filter((u) => u.active));
        }
      })
      .catch((e) => {
        if (active) setError(String(e));
      });
    return () => {
      active = false;
    };
  }, [id, user.role, revision]);
  function edit(row: Row, _field: string, old: unknown) {
    if (row.value === old) return;
    setBusy(true);
    pending.current = pending.current.then(async () => {
      setError("");
      try {
        const key = String(row.key);
        const value = projectValue(key, row.value, settings, users);
        setProject(await api<Row>(`projects/${id}`, "PATCH", { [key]: value }));
      } catch (e) {
        setError(String(e));
        setRevision((v) => v + 1);
      } finally {
        setBusy(false);
      }
    });
  }
  async function archive() {
    setError("");
    try {
      setProject(
        await api<Row>(`projects/${id}/archive`, "POST", { archived: !project?.archived }),
      );
    } catch (e) {
      setError(String(e));
    }
  }
  const choices = (key: string) =>
    key === "type"
      ? projectTypes.map((v) => ({ value: v, label: v }))
      : key === "cost_allocation_method"
        ? ["saleable_area", "sale_value"].map((v) => ({ value: v, label: v }))
        : key === "revenue_recognition"
          ? [{ value: "on_handover", label: "on_handover" }]
          : key === "project_manager_id"
            ? users.map((u) => ({ value: String(u.email), label: String(u.role) }))
            : null;
  const register = (
    {
      Partners: "partners",
      Construction: "construction",
      Estimate: "estimate",
      Flats: "flats",
      Sales: "flats",
    } as Record<string, WorkbookSheet>
  )[tab];
  const chooseTab = (next: (typeof projectTabs)[number]) => {
    if (next === tab) return;
    if (dirty || busy) {
      setError("Save or discard your sheet edits before changing tabs.");
      return;
    }
    setError("");
    setTab(next);
  };
  return (
    <div className="accounting-workspace project-workbook">
      <header className="project-workbook-heading">
        <div>
          <Link to="/projects">Projects</Link>
          <h2>{project ? String(project.name) : "Opening project…"}</h2>
          <p>
            {String(project?.code ?? "")} · {String(project?.city ?? "")}{" "}
            <span className="project-status">
              {String(project?.status ?? "").replace(/_/g, " ")}
            </span>
          </p>
        </div>
        <span>
          {busy
            ? "Saving…"
            : dirty
              ? "Unsaved changes"
              : project?.archived
                ? "Archived"
                : "Project workbook"}
        </span>
      </header>
      {error && <p role="alert">{error}</p>}
      {project && (
        <>
          <nav className="project-sheet-tabs" role="tablist" aria-label="Project workspace">
            {projectTabs.map((name, index) => (
              <button
                key={name}
                id={`project-tab-${name}`}
                role="tab"
                aria-selected={tab === name}
                aria-controls="project-sheet-panel"
                tabIndex={tab === name ? 0 : -1}
                onClick={() => chooseTab(name)}
                onKeyDown={(e) => {
                  if (["ArrowRight", "ArrowLeft", "Home", "End"].includes(e.key)) {
                    e.preventDefault();
                    const next =
                      e.key === "Home"
                        ? 0
                        : e.key === "End"
                          ? projectTabs.length - 1
                          : (index + (e.key === "ArrowRight" ? 1 : projectTabs.length - 1)) %
                            projectTabs.length;
                    if (!dirty && !busy) {
                      chooseTab(projectTabs[next]);
                      document.getElementById(`project-tab-${projectTabs[next]}`)?.focus();
                    }
                  }
                }}
              >
                {name}
              </button>
            ))}
          </nav>
          <div
            role="tabpanel"
            id="project-sheet-panel"
            aria-labelledby={`project-tab-${tab}`}
            className="project-sheet-panel"
          >
            {tab === "Overview" && (
              <>
                <p className="sheet-hint">
                  Project details · Double-click to edit. Areas in {settings.areaDisplayUnit}.
                  Additional fields are available under More → Columns and pinning.
                </p>
                <Grid
                  screen={`project-profile-${id}`}
                  rows={[
                    {
                      ...project,
                      ...Object.fromEntries(
                        Object.keys(profileLabels).map((key) => [
                          key,
                          displayProjectValue(project, key, settings),
                        ]),
                      ),
                    },
                  ]}
                  columns={Object.entries(profileLabels).map(([key, label]) => ({
                    field: key,
                    headerName:
                      label + (areaFields.includes(key) ? ` (${settings.areaDisplayUnit})` : ""),
                    minWidth: key === "name" ? 150 : 95,
                    hide: ![
                      "code",
                      "name",
                      "type",
                      "city",
                      "land_area_sqft",
                      "saleable_area_sqft",
                      "start_date",
                    ].includes(key),
                    editable: () => !busy && canEditProfile(user.role, key),
                    cellEditorSelector: () => {
                      const values = choices(key);
                      return values
                        ? { component: SearchSelectEditor, params: { choices: values } }
                        : undefined;
                    },
                  }))}
                  onCellChange={(row, field, old) =>
                    edit({ key: field, value: row[field] }, field, old)
                  }
                  summary={() => (
                    <>
                      <span className="sheet-summary-label">
                        Project areas · {settings.areaDisplayUnit}
                      </span>
                      {areaFields.map((key) => (
                        <span key={key}>
                          {profileLabels[key]}
                          <strong>
                            {String(displayProjectValue(project, key, settings) || "Not entered")}
                          </strong>
                        </span>
                      ))}
                    </>
                  )}
                />
                {user.role === "admin" && (
                  <details className="project-controls">
                    <summary>Project status and archive</summary>
                    <ProjectStatusControl
                      key={String(project.status)}
                      projectId={id}
                      status={project.status as ProjectStatus}
                      onSaved={(p) => {
                        setProject(p);
                        setRevision((v) => v + 1);
                      }}
                    />
                    <button onClick={() => void archive()}>
                      {project.archived ? "Unarchive project" : "Archive project"}
                    </button>
                  </details>
                )}
              </>
            )}
            {register && (
              <ProjectRegister
                key={tab}
                projectId={id}
                sheet={register}
                user={user}
                archived={Boolean(project.archived)}
                sales={tab === "Sales"}
                marlaSqft={settings.marlaSqft}
                onDirty={setDirty}
              />
            )}
            {tab === "Buildings" && <BuildingsGrid projectId={id} role={user.role} />}
            {tab === "Team" && <AssignedUsersGrid projectId={id} role={user.role} />}
            {tab === "History" && (
              <Grid
                screen={`status-history-${id}`}
                rows={history}
                columns={[
                  "from_status",
                  "to_status",
                  "changed_by_name",
                  "changed_at",
                  "reason",
                ].map((field) => ({ field, editable: false }))}
              />
            )}
          </div>
        </>
      )}
    </div>
  );
}
