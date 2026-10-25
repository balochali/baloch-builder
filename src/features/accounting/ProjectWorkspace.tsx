import { useEffect, useState, useRef } from "react";
import { useParams } from "react-router-dom";
import {
  defaultAreaSettings,
  projectTypes,
  type AreaSettings,
  type ProjectStatus,
} from "@baloch/shared";
import type { SessionUser } from "@/data/session";
import { api } from "@/data/api";
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
export const futureProjectTabs = [
  "Land",
  "Partners",
  "Budget",
  "Units",
  "Construction",
  "Sales",
  "Payments and Receipts",
  "Documents",
  "Ledger and Reports",
  "Closing",
];
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
  return (
    <div className="accounting-workspace">
      <h2>{project ? String(project.name) : "Project profile"}</h2>
      {error && <p role="alert">{error}</p>}
      {project && (
        <>
          <nav role="tablist" aria-label="Project workspace">
            <button role="tab" aria-selected="true">
              Profile
            </button>
            {futureProjectTabs.map((tab) => (
              <button key={tab} role="tab" disabled aria-selected="false">
                {tab} — Coming soon
              </button>
            ))}
          </nav>
          <p>
            Status: {String(project.status)} · {project.archived ? "Archived" : "Active"} · Areas in{" "}
            {settings.areaDisplayUnit}. 1 marla = {settings.marlaSqft} sqft; 1 kanal = 20 marla.
            Converted display rounds to 12 decimal places; unchanged cells retain their exact stored
            square feet.
          </p>
          {user.role === "admin" && (
            <button onClick={() => void archive()}>
              {project.archived ? "Unarchive project" : "Archive project"}
            </button>
          )}
          <Grid
            screen={`project-profile-${id}`}
            rows={Object.entries(profileLabels).map(([key, label]) => ({
              id: key,
              key,
              field: label + (areaFields.includes(key) ? ` (${settings.areaDisplayUnit})` : ""),
              value: displayProjectValue(project, key, settings),
            }))}
            columns={[
              { field: "field", headerName: "Field", editable: false },
              {
                field: "value",
                headerName: "Value",
                editable: (p) => !busy && canEditProfile(user.role, String(p.data?.key)),
                cellEditorSelector: (p) => {
                  const values = choices(String(p.data?.key));
                  return values
                    ? { component: SearchSelectEditor, params: { choices: values } }
                    : undefined;
                },
              },
            ]}
            onCellChange={edit}
          />
          <BuildingsGrid projectId={id} role={user.role} />
          <AssignedUsersGrid projectId={id} role={user.role} />
          {user.role === "admin" && (
            <ProjectStatusControl
              key={String(project.status)}
              projectId={id}
              status={project.status as ProjectStatus}
              onSaved={(p) => {
                setProject(p);
                setRevision((v) => v + 1);
              }}
            />
          )}
          <h3>Status history</h3>
          <Grid
            short
            screen={`status-history-${id}`}
            rows={history}
            columns={["from_status", "to_status", "changed_by_name", "changed_at", "reason"].map(
              (field) => ({ field, editable: false }),
            )}
          />
        </>
      )}
    </div>
  );
}
