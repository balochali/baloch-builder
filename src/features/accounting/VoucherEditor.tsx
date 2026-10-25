import { SearchSelectEditor } from "./SearchSelectEditor";
import { tagVoucherRows, resolveHead } from "./costHeadGrid";
import { useEffect, useState } from "react";
import type { ColDef } from "ag-grid-community";
import { parseAmount, formatPKR, voucherSchema } from "@baloch/shared";
import { Grid, type Row } from "./Grid";
import { api } from "@/data/api";
import { emptyLine, isBlankLine, withBlankLine, entryTotals, entryFooter } from "./voucherGrid";

export function VoucherEditor({ id, onSaved }: { id: string; onSaved: (id: string) => void }) {
  const [header, setHeader] = useState<Row[]>([
    { date: new Date().toISOString().slice(0, 10), type: "JV", narration: "", correctionOfId: "" },
  ]);
  const [lines, setLines] = useState<Row[]>([emptyLine(), emptyLine()]);
  const [accounts, setAccounts] = useState<Row[]>([]);
  const [projects, setProjects] = useState<Row[]>([]);
  const [heads, setHeads] = useState<Row[]>([]);
  const [status, setStatus] = useState("draft");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [attachments, setAttachments] = useState<Row[]>([]);
  const [reverse, setReverse] = useState<Row[]>([
    { date: new Date().toISOString().slice(0, 10), narration: "" },
  ]);
  useEffect(() => {
    let active = true;
    Promise.all([
      api<Row[]>("accounts"),
      api<Row[]>("projects"),
      api<Row[]>("cost-heads"),
      id === "new" ? Promise.resolve(null) : api<Row>(`vouchers/${id}`),
      id === "new" ? Promise.resolve([]) : api<Row[]>(`vouchers/${id}/attachments`),
    ])
      .then(([a, p, h, v, files]) => {
        if (!active) return;
        setAccounts(a);
        setProjects(p);
        setHeads(h);
        setAttachments(files);
        if (v) {
          setHeader([
            {
              date: v.date,
              type: v.type,
              narration: v.narration,
              correctionOfId: v.correction_of_id ?? "",
            },
          ]);
          setStatus(String(v.status));
          setLines(
            (v.lines as Row[])
              .map<Row>((l) => ({
                ...l,
                cost_head: h.find((x) => x.id === l.costHeadId)?.code ?? "",
                account: a.find((x) => x.id === l.accountId)?.code ?? "",
                project: p.find((x) => x.id === l.projectId)?.code ?? "",
                debit: formatPKR(BigInt(String(l.debit)), { showSymbol: false }),
                credit: formatPKR(BigInt(String(l.credit)), { showSymbol: false }),
              }))
              .concat(v.status === "draft" ? [emptyLine()] : []),
          );
        }
      })
      .catch((e) => {
        if (active) setError(String(e));
      });
    return () => {
      active = false;
    };
  }, [id]);
  const editable = status === "draft";
  const columns: ColDef<Row>[] = [
    {
      field: "account",
      headerName: "Account code",
      editable,
      cellEditor: "agSelectCellEditor",
      cellEditorParams: { values: accounts.filter((a) => !a.archived).map((a) => a.code) },
    },
    {
      field: "project",
      headerName: "Project code",
      editable,
      cellEditor: "agSelectCellEditor",
      cellEditorParams: { values: projects.filter((p) => !p.archived).map((p) => p.code) },
    },
    {
      field: "cost_head",
      headerName: "Cost head",
      editable,
      cellEditor: SearchSelectEditor,
      cellEditorParams: {
        choices: heads
          .filter((h) => h.active && !h.budget_only)
          .map((h) => ({ value: String(h.code), label: String(h.name) })),
      },
    },
    { field: "debit", headerName: "Debit PKR", editable },
    { field: "credit", headerName: "Credit PKR", editable },
    { field: "narration", editable },
    { field: "difference", headerName: "Difference", editable: false },
    { field: "error", valueGetter: (p) => p.data?.cost_head_error || p.data?.error || "" },
  ];
  const { debit, credit, invalid } = entryTotals(lines);
  const cannotSave =
    invalid || debit !== credit || debit === 0n || lines.filter((l) => !isBlankLine(l)).length < 2;
  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    const checked = lines
      .filter((l) => !isBlankLine(l))
      .map((l) => {
        try {
          const debit = parseAmount(String(l.debit || "0")).toString();
          const credit = parseAmount(String(l.credit || "0")).toString();
          const accountId = accounts.find((a) => a.code === l.account)?.id;
          const projectId = projects.find((p) => p.code === l.project)?.id;
          if (!accountId || !projectId) throw new Error("Choose a valid account and project code");
          if (
            BigInt(debit) > 0n === BigInt(credit) > 0n ||
            BigInt(debit) < 0n ||
            BigInt(credit) < 0n
          )
            throw new Error("Enter one positive debit or credit");
          const head = resolveHead(l.cost_head, heads);
          if (l.cost_head && (!head || !head.active || head.budget_only))
            throw new Error("Choose an active, non-budget-only cost head");
          return {
            ...l,
            accountId,
            projectId,
            costHeadId: head?.id ?? null,
            paisaDebit: debit,
            paisaCredit: credit,
            error: "",
          };
        } catch (e) {
          return { ...l, error: String(e) };
        }
      });
    setLines(withBlankLine(checked));
    if (checked.some((l) => l.error)) throw new Error("Correct marked voucher lines");
    const body = voucherSchema.parse({
      ...header[0],
      correctionOfId: header[0].correctionOfId || null,
      lines: checked.map((l) => {
        const row = l as Row;
        return {
          accountId: row.accountId,
          projectId: row.projectId,
          costHeadId: row.costHeadId,
          debit: row.paisaDebit,
          credit: row.paisaCredit,
          narration: String(row.narration ?? ""),
          partnerId: row.partnerId ?? null,
          supplierId: row.supplierId ?? null,
          buyerId: row.buyerId ?? null,
          unitId: row.unitId ?? null,
        };
      }),
    });
    const v = await api<{ id: string }>(
      id === "new" ? "vouchers" : `vouchers/${id}`,
      id === "new" ? "POST" : "PUT",
      body,
    );
    onSaved(v.id);
  }
  return (
    <section>
      <h2>{id === "new" ? "New voucher" : `Voucher · ${status}`}</h2>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <Grid
        short
        screen="voucher-header"
        rows={header}
        columns={[
          { field: "date", editable },
          {
            field: "type",
            editable,
            cellEditor: "agSelectCellEditor",
            cellEditorParams: { values: ["BRV", "BPV", "CRV", "CPV", "JV", "PIV", "SIV"] },
          },
          { field: "narration", editable },
          { field: "correctionOfId", headerName: "Corrects voucher ID", editable },
        ]}
        onChange={editable ? setHeader : undefined}
      />
      <Grid
        screen="voucher-lines"
        rows={editable ? tagVoucherRows(lines, accounts, heads) : lines}
        columns={columns}
        onChange={
          editable
            ? (rows) => setLines(withBlankLine(tagVoucherRows(rows, accounts, heads)))
            : undefined
        }
        totals={entryFooter}
      />
      <p role="status">
        Debit {formatPKR(debit)} · Credit {formatPKR(credit)} ·{" "}
        {invalid
          ? "Invalid amount"
          : debit === credit
            ? "Balanced"
            : `Out of balance by ${formatPKR(debit - credit)}`}
      </p>
      <div className="toolbar">
        {editable && (
          <>
            <button onClick={() => setLines((l) => [...l, emptyLine()])}>Add line</button>
            <button disabled={busy || cannotSave} onClick={() => run(save)}>
              Save draft
            </button>
            {id !== "new" && (
              <button
                disabled={
                  busy ||
                  cannotSave ||
                  tagVoucherRows(lines, accounts, heads).some((l) => Boolean(l.cost_head_error))
                }
                onClick={() =>
                  run(async () => {
                    await save();
                    await api(`vouchers/${id}/post`, "POST");
                    setStatus("posted");
                    onSaved(id);
                  })
                }
              >
                Save and post
              </button>
            )}
          </>
        )}
      </div>
      {id !== "new" && (
        <>
          <h2>Attachments</h2>
          <Grid
            short
            screen="voucher-attachments"
            rows={attachments}
            columns={[
              { field: "filename" },
              { field: "content_type" },
              { field: "size" },
              { field: "id" },
            ]}
            onSelect={(r) => {
              window.open(`/api/attachments/${r.id}`, "_blank", "noopener");
            }}
          />
          {editable && (
            <label>
              Attach file
              <input
                type="file"
                accept="application/pdf,image/png,image/jpeg,text/plain"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  void run(async () => {
                    if (file.size > 10 * 1024 * 1024) throw new Error("Maximum 10 MiB");
                    const base64 = await new Promise<string>((resolve, reject) => {
                      const reader = new FileReader();
                      reader.onload = () => resolve(String(reader.result).split(",")[1]);
                      reader.onerror = () => reject(reader.error);
                      reader.readAsDataURL(file);
                    });
                    await api(`vouchers/${id}/attachments`, "POST", {
                      filename: file.name,
                      contentType: file.type,
                      base64,
                    });
                    setAttachments(await api<Row[]>(`vouchers/${id}/attachments`));
                  });
                }}
              />
            </label>
          )}
        </>
      )}
      {status === "posted" && (
        <>
          <h2>Reversing voucher</h2>
          <Grid
            short
            screen="reversal"
            rows={reverse}
            columns={[
              { field: "date", editable: true },
              { field: "narration", editable: true },
            ]}
            onChange={setReverse}
          />
          <button
            disabled={busy}
            onClick={() =>
              run(async () => {
                const result = await api<{ id: string }>(
                  `vouchers/${id}/reverse`,
                  "POST",
                  reverse[0],
                );
                onSaved(result.id);
              })
            }
          >
            Create reversing draft
          </button>
          <p>
            Review and post the reversal in an open period. Cash/bank credits require Phase 2
            approval.
          </p>
        </>
      )}
      <details>
        <summary>Account and project lookup</summary>
        <Grid
          short
          screen="voucher-account-lookup"
          rows={accounts}
          columns={[{ field: "code" }, { field: "name" }, { field: "type" }]}
        />
        <Grid
          short
          screen="voucher-project-lookup"
          rows={projects}
          columns={[{ field: "code" }, { field: "name" }]}
        />
      </details>
    </section>
  );
}
