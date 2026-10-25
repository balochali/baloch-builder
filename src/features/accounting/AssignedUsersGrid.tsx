import { useEffect, useState, useCallback } from "react";
import type { Role } from "@baloch/shared";
import { api } from "@/data/api";
import { Grid, type Row } from "./Grid";
export function AssignedUsersGrid({ projectId, role }: { projectId: string; role: Role }) {
  const [rows, setRows] = useState<Row[]>([]),
    [users, setUsers] = useState<Row[]>([]),
    [draft, setDraft] = useState<Row[]>([{ email: "" }]),
    [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    setRows(await api<Row[]>(`projects/${projectId}/assignments`));
  }, [projectId]);
  useEffect(() => {
    let active = true;
    Promise.all([
      api<Row[]>(`projects/${projectId}/assignments`),
      role === "admin" ? api<Row[]>("users") : Promise.resolve([]),
    ])
      .then(([a, u]) => {
        if (active) {
          setRows(a);
          setUsers(u.filter((v) => v.active));
        }
      })
      .catch((e) => {
        if (active) setError(String(e));
      });
    return () => {
      active = false;
    };
  }, [projectId, role]);
  async function save(add = false) {
    setBusy(true);
    setError("");
    try {
      if (add) {
        const u = users.find((u) => u.email === draft[0].email);
        if (!u) throw Error("Choose an active user");
        await api("assignments", "POST", { projectId, userId: u.id, active: true });
        setDraft([{ email: "" }]);
      } else
        for (const r of rows)
          if (r.active === false || r.active === "false")
            await api("assignments", "POST", { projectId, userId: r.user_id, active: false });
      await load();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section>
      <h3>Assigned users</h3>
      {error && <p role="alert">{error}</p>}
      <Grid
        short
        screen={`project-users-${projectId}`}
        rows={rows}
        columns={[
          { field: "email" },
          { field: "role" },
          {
            field: "active",
            headerName: "Assigned",
            editable: role === "admin",
            cellDataType: "boolean",
          },
        ]}
        onChange={role === "admin" ? setRows : undefined}
      />
      {role === "admin" && (
        <>
          <button disabled={busy} onClick={() => void save()}>
            Remove unchecked assignments
          </button>
          <Grid
            short
            screen={`assign-user-${projectId}`}
            rows={draft}
            columns={[
              {
                field: "email",
                headerName: "Active user",
                editable: true,
                cellEditor: "agSelectCellEditor",
                cellEditorParams: { values: users.map((u) => u.email) },
              },
            ]}
            onChange={setDraft}
          />
          <button disabled={busy} onClick={() => void save(true)}>
            Assign user
          </button>
        </>
      )}
    </section>
  );
}
