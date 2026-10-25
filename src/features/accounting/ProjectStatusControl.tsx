import { useState } from "react";
import { projectStatuses, statusTransitionError, type ProjectStatus } from "@baloch/shared";
import { api } from "@/data/api";
import { Grid, type Row } from "./Grid";
export function ProjectStatusControl({
  projectId,
  status,
  onSaved,
}: {
  projectId: string;
  status: ProjectStatus;
  onSaved: (row: Row) => void;
}) {
  const [rows, setRows] = useState<Row[]>([{ status, reason: "" }]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const backward =
    projectStatuses.indexOf(rows[0].status as ProjectStatus) < projectStatuses.indexOf(status);
  async function save() {
    setError("");
    const reason = String(rows[0].reason ?? "");
    const target = rows[0].status as ProjectStatus;
    const invalid = statusTransitionError(status, target, reason);
    if (invalid) {
      setError(invalid);
      return;
    }
    setBusy(true);
    try {
      onSaved(await api<Row>(`projects/${projectId}/status`, "POST", { status: target, reason }));
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section>
      <h3>Status</h3>
      {backward && <p role="status">A written reason is required when moving backward.</p>}
      {error && <p role="alert">{error}</p>}
      <Grid
        short
        screen={`project-status-${projectId}`}
        rows={rows}
        columns={[
          {
            field: "status",
            editable: !busy,
            cellEditor: "agSelectCellEditor",
            cellEditorParams: { values: projectStatuses.filter((s) => s !== "closed") },
          },
          { field: "reason", editable: !busy, headerName: "Reason (required for backward moves)" },
        ]}
        onChange={setRows}
      />
      <button disabled={busy} onClick={() => void save()}>
        Change status
      </button>
    </section>
  );
}
