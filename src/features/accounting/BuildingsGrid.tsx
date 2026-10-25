import { useEffect, useState } from "react";
import type { Role } from "@baloch/shared";
import { buildingSchema } from "@baloch/shared";
import { api } from "@/data/api";
import { Grid, type Row } from "./Grid";
export function BuildingsGrid({ projectId, role }: { projectId: string; role: Role }) {
  const [rows, setRows] = useState<Row[]>([]),
    [draft, setDraft] = useState<Row[]>([{ name: "", floors: "0", sort_order: "0" }]),
    [error, setError] = useState(""),
    [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    api<Row[]>(`projects/${projectId}/buildings`)
      .then((r) => {
        if (active) setRows(r);
      })
      .catch((e) => {
        if (active) setError(String(e));
      });
    return () => {
      active = false;
    };
  }, [projectId, revision]);
  const admin = role === "admin";
  const columns = ["name", "floors", "sort_order"].map((field) => ({ field, editable: admin }));
  async function save(row: Row, creating = false) {
    setError("");
    try {
      const data = buildingSchema.parse({
        name: row.name,
        floors: Number(row.floors),
        sort_order: Number(row.sort_order),
      });
      await api(
        `projects/${projectId}/buildings${creating ? "" : `/${row.id}`}`,
        creating ? "POST" : "PATCH",
        data,
      );
      if (creating) setDraft([{ name: "", floors: "0", sort_order: "0" }]);
      setRevision((v) => v + 1);
    } catch (e) {
      setError(String(e));
      setRevision((v) => v + 1);
    }
  }
  async function remove() {
    setError("");
    try {
      for (const row of rows.filter((r) => r.remove === true || r.remove === "true"))
        await api(`projects/${projectId}/buildings/${row.id}`, "DELETE");
      setRevision((v) => v + 1);
    } catch (e) {
      setError(String(e));
    }
  }
  return (
    <section>
      <h3>Buildings</h3>
      {error && <p role="alert">{error}</p>}
      <Grid
        short
        screen={`buildings-${projectId}`}
        rows={rows}
        columns={[
          ...columns,
          ...(admin ? [{ field: "remove", editable: true, cellDataType: "boolean" }] : []),
        ]}
        onChange={admin ? setRows : undefined}
        onCellChange={
          admin
            ? (r, f) => {
                if (f !== "remove") void save(r);
              }
            : undefined
        }
      />
      {admin && (
        <>
          <button onClick={() => void remove()}>Delete selected unreferenced buildings</button>
          <Grid
            short
            screen={`buildings-new-${projectId}`}
            rows={draft}
            columns={columns}
            onChange={setDraft}
          />
          <button onClick={() => void save(draft[0], true)}>Add building</button>
        </>
      )}
    </section>
  );
}
