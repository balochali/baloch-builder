import { formatPKR, formatPercent, parsePKR } from "./feasibilityFormat";
import { sampleFeasibility } from "./sampleFeasibility";
import { useEffect, useState } from "react";
import { api } from "@/data/api";
import { ChevronDown, Plus } from "lucide-react";
import type { FeasibilityData, Partner } from "@baloch/shared";
import { FeasibilityGrid, figure, numericValue, numberCell, type Cell } from "./FeasibilityGrid";
import {
  calculateFeasibility,
  defaultFeasibility,
  range,
  costRow,
  fundingRow,
  salesRow,
} from "./feasibilityCalc";
import { useFeasibility } from "./useFeasibility";
import "./feasibility.css";

type Change = { row: number; col: number; value: string };
const computed = (value: number | null, percent = false): Cell => ({
  value: percent ? formatPercent(value) : figure(value),
  title: value === null || percent ? undefined : figure(value) + " PKR",
  readOnly: true,
  numeric: true,
});
const moneyRange = ({ min, max }: { min: number; max: number }) =>
  `${formatPKR(min)} – ${formatPKR(max)}`;
const moneyInput = (value?: number, fallback?: number, warning = false): Cell => ({
  value: value === undefined && fallback === undefined ? "" : figure(value ?? fallback!),
  editValue: value === undefined ? "" : figure(value),
  title: warning
    ? "Min should not be more than Max"
    : value === undefined && fallback === undefined
      ? undefined
      : figure(value ?? fallback!) + " PKR",
  warning,
  numeric: true,
  shorthand: true,
  validate: (raw) => !raw.trim() || (Number.isFinite(parsePKR(raw)) && parsePKR(raw) <= 1e15),
});
const percentInput = (value: number, explicit = true): Cell => ({
  ...numberCell(value, 100),
  value: formatPercent(value),
  editValue: explicit ? formatPercent(value).slice(0, -1) : "",
});
const percentValue = (value: string) => Math.round(numericValue(value) * 100) / 100;
const choice = (value: string, choices: readonly string[]): Cell => ({ value, choices });
function revise<T>(
  rows: T[],
  changes: Change[],
  create: () => T,
  apply: (item: T, col: number, value: string) => T,
) {
  const next = [...rows];
  for (const { row, col, value } of changes) {
    while (next.length <= row) next.push(create());
    next[row] = apply(next[row], col, value);
  }
  return next;
}
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <details open className="feasibility-section">
      <summary>
        {title}
        <ChevronDown size={18} />
      </summary>
      <div className="feasibility-section-body">{children}</div>
    </details>
  );
}
function Metrics({ values }: { values: [string, string][] }) {
  return (
    <dl className="feasibility-metrics">
      {values.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}
export function Feasibility({
  id,
  manage,
  projectPartners,
  onPendingChange,
}: {
  id: string;
  manage: boolean;
  projectPartners: Partner[];
  onPendingChange?: (pending: boolean) => void;
}) {
  const { plan, status, error, locking, update, toggle, retry } = useFeasibility(id);
  useEffect(() => {
    onPendingChange?.(locking || !["Saved", "Draft", "Unavailable"].includes(status));
  }, [locking, onPendingChange, status]);
  const [options, setOptions] = useState<{ id: string; name: string }[]>([]);
  useEffect(() => {
    if (!manage) return;
    let active = true;
    api<{ id: string; name: string }[]>("partners")
      .then((rows) => {
        if (active && Array.isArray(rows)) setOptions(rows);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [manage]);
  const knownPartners = new Map(options.map((partner) => [partner.name, partner.id]));
  for (const partner of projectPartners)
    if (!knownPartners.has(partner.name)) knownPartners.set(partner.name, partner.partnerId);
  if (!plan) return <p role={error ? "alert" : "status"}>{error || "Loading feasibility..."}</p>;
  const locked = !manage || locking || plan.status === "approved";
  function loadSample() {
    if (!plan || locked) return;
    const sheet = (data: FeasibilityData) => ({
      costCategories: data.costCategories,
      salesRows: data.salesRows,
      partners: data.partners,
    });
    const fingerprint = (data: FeasibilityData) =>
      JSON.stringify(sheet(data), (key, value) => {
        if (key === "id") return undefined;
        if (value && typeof value === "object" && !Array.isArray(value)) {
          return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)));
        }
        return value;
      });
    const empty = !plan.costCategories.length && !plan.salesRows.length && !plan.partners.length;
    if (
      !empty &&
      fingerprint(plan) !== fingerprint(defaultFeasibility()) &&
      !window.confirm("This will replace the current feasibility sheet with sample data.")
    )
      return;
    update((current) => ({
      ...current,
      ...structuredClone(sampleFeasibility.feasibility),
      costCategories: sampleFeasibility.feasibility.costCategories.map((category) => ({
        ...structuredClone(category),
        ...(category.id === "c4" ? { contractor: true } : {}),
      })),
    }));
  }
  const totals = calculateFeasibility(plan);
  const values: [string, string][] = [
    ["Total estimated cost (PKR)", moneyRange(totals.cost)],
    ["Expected sales (PKR)", moneyRange(totals.expected)],
    [
      "Expected profit (PKR)",
      `Worst ${formatPKR(totals.profit.worst)} / Best ${formatPKR(totals.profit.best)}`,
    ],
    [
      "Profit margin",
      `${formatPercent(totals.margin.worst)} – ${formatPercent(totals.margin.best)}`,
    ],
  ];
  function changeCategory(
    index: number,
    change: (
      category: FeasibilityData["costCategories"][number],
    ) => FeasibilityData["costCategories"][number],
  ) {
    update((p) => ({
      ...p,
      costCategories: p.costCategories.map((category, i) =>
        i === index ? change(category) : category,
      ),
    }));
  }
  return (
    <div className="feasibility">
      <div className="feasibility-sticky">
        <div className="feasibility-toolbar">
          <div>
            <h2>Feasibility</h2>
            <span role="status">{status}</span>
            {import.meta.env.DEV && import.meta.env.MODE === "development" && manage && (
              <button
                type="button"
                className="projects-secondary feasibility-add"
                onClick={loadSample}
                disabled={locked}
                title={plan.status === "approved" ? "Unlock to load sample data" : undefined}
              >
                Load sample data
              </button>
            )}
          </div>
          <div>
            <span className="project-status">
              {plan.status === "approved" ? "Approved" : "Draft"}
            </span>
            {manage && (
              <button className="projects-primary" disabled={locking} onClick={() => void toggle()}>
                {plan.status === "approved" ? "Unlock to edit" : "Approve baseline"}
              </button>
            )}
          </div>
        </div>
        <Metrics values={values} />
        {error && (
          <div className="feasibility-error" role="alert">
            {error}{" "}
            <button className="projects-secondary" onClick={retry}>
              Retry save
            </button>
          </div>
        )}
      </div>
      <p className="feasibility-intro">
        Plan estimated costs, sales and funding for this project. Figures are in PKR unless noted.
      </p>
      <Section title="Cost estimate">
        {plan.costCategories.map((category, index) => (
          <div className="feasibility-category" key={category.id}>
            <div className="feasibility-band">
              <input
                aria-label="Category name"
                maxLength={500}
                value={category.name}
                readOnly={locked}
                onChange={(e) => changeCategory(index, (c) => ({ ...c, name: e.target.value }))}
              />
              <strong>{moneyRange(totals.subtotals[index])} PKR</strong>
              {!locked && category.contingencyPercent === undefined && (
                <button
                  className="feasibility-delete-category"
                  type="button"
                  onClick={() =>
                    update((p) => ({
                      ...p,
                      costCategories: p.costCategories.filter((c) => c.id !== category.id),
                    }))
                  }
                >
                  Remove category
                </button>
              )}
            </div>
            {category.contingencyPercent !== undefined ? (
              <FeasibilityGrid
                headers={["Item", "Contingency %", "Min amount", "Max amount"]}
                locked={locked}
                rows={[
                  {
                    id: category.id,
                    cells: [
                      { value: "Allowance on other costs", readOnly: true },
                      percentInput(category.contingencyPercent),
                      computed(totals.subtotals[index].min),
                      computed(totals.subtotals[index].max),
                    ],
                  },
                ]}
                onChange={(changes) => {
                  if (changes[0])
                    changeCategory(index, (c) => ({
                      ...c,
                      contingencyPercent: percentValue(changes[0].value),
                    }));
                }}
              />
            ) : (
              <FeasibilityGrid
                headers={
                  category.contractor
                    ? ["Item", "Min amount", "Max amount", "Notes", "Type"]
                    : ["Item", "Min amount", "Max amount", "Notes"]
                }
                locked={locked}
                rows={category.rows.map((row) => ({
                  id: row.id,
                  cells: [
                    { value: row.item },
                    moneyInput(
                      row.minAmount,
                      row.maxAmount,
                      range(row.minAmount, row.maxAmount).min >
                        range(row.minAmount, row.maxAmount).max,
                    ),
                    moneyInput(
                      row.maxAmount,
                      row.minAmount,
                      range(row.minAmount, row.maxAmount).min >
                        range(row.minAmount, row.maxAmount).max,
                    ),
                    { value: row.notes },
                    ...(category.contractor
                      ? [choice(row.type ?? "Labour", ["Labour", "Labour + Material"])]
                      : []),
                  ],
                }))}
                onAdd={() => changeCategory(index, (c) => ({ ...c, rows: [...c.rows, costRow()] }))}
                onDelete={(row) =>
                  changeCategory(index, (c) => ({ ...c, rows: c.rows.filter((_, i) => i !== row) }))
                }
                onChange={(changes) =>
                  changeCategory(index, (c) => ({
                    ...c,
                    rows: revise(c.rows, changes, costRow, (row, col, value) => {
                      if (col === 0) return { ...row, item: value };
                      if (col === 1 || col === 2)
                        return {
                          ...row,
                          [col === 1 ? "minAmount" : "maxAmount"]: value.trim()
                            ? parsePKR(value)
                            : undefined,
                        };
                      if (col === 3) return { ...row, notes: value };
                      return { ...row, type: value as "Labour" | "Labour + Material" };
                    }),
                  }))
                }
              />
            )}
          </div>
        ))}
        {!locked && (
          <button
            className="projects-secondary"
            onClick={() =>
              update((p) => ({
                ...p,
                costCategories: [
                  ...p.costCategories,
                  { id: crypto.randomUUID(), name: "New category", rows: [costRow()] },
                ],
              }))
            }
          >
            <Plus size={16} /> Add category
          </button>
        )}
        <p className="feasibility-total">
          <span>
            Total min cost <strong>PKR {formatPKR(totals.cost.min)}</strong>
          </span>
          <span>
            Total max cost <strong>PKR {formatPKR(totals.cost.max)}</strong>
          </span>
        </p>
      </Section>
      <Section title="Sales estimate">
        <FeasibilityGrid
          locked={locked}
          headers={[
            "Unit type",
            "Count",
            "Area per unit (sq ft)",
            "Min rate / sq ft",
            "Max rate / sq ft",
            "Min price per unit",
            "Max price per unit",
            "Min total value",
            "Max total value",
            "Expected sold %",
          ]}
          rows={plan.salesRows.map((row, i) => ({
            id: row.id,
            cells: [
              { value: row.unitType },
              numberCell(row.count, 1e15, true),
              numberCell(row.areaSqft),
              {
                ...numberCell(row.minRatePerSqft ?? row.maxRatePerSqft),
                editValue: row.minRatePerSqft === undefined ? "" : figure(row.minRatePerSqft),
              },
              {
                ...numberCell(row.maxRatePerSqft ?? row.minRatePerSqft),
                editValue: row.maxRatePerSqft === undefined ? "" : figure(row.maxRatePerSqft),
              },
              computed(totals.sales[i].price.min),
              computed(totals.sales[i].price.max),
              computed(totals.sales[i].total.min),
              computed(totals.sales[i].total.max),
              percentInput(row.soldPercent),
            ],
          }))}
          onAdd={() => update((p) => ({ ...p, salesRows: [...p.salesRows, salesRow()] }))}
          onDelete={(row) =>
            update((p) => ({ ...p, salesRows: p.salesRows.filter((_, i) => i !== row) }))
          }
          onChange={(changes) =>
            update((p) => ({
              ...p,
              salesRows: revise(p.salesRows, changes, salesRow, (row, col, value) => {
                const n = numericValue(value);
                if (col === 0) return { ...row, unitType: value };
                if (col === 1) return { ...row, count: n };
                if (col === 2) return { ...row, areaSqft: n };
                if (col === 3 || col === 4)
                  return {
                    ...row,
                    [col === 3 ? "minRatePerSqft" : "maxRatePerSqft"]: value.trim() ? n : undefined,
                  };
                return { ...row, soldPercent: percentValue(value) };
              }),
            }))
          }
          footer={
            <span>
              {figure(totals.units)} units | Sales value PKR {moneyRange(totals.value)} | Expected
              sales PKR {moneyRange(totals.expected)}
            </span>
          }
        />
      </Section>
      <Section title="Partners & funding">
        <FeasibilityGrid
          groups={[
            { label: "Partner funding", columns: 5 },
            { label: "Worst case", columns: 3 },
            { label: "Best case", columns: 3 },
          ]}
          locked={locked}
          headers={[
            "Partner",
            "Contribution type",
            "Capital (PKR)",
            "Capital %",
            "Profit share %",
            "Worst profit",
            "Worst total return",
            "Worst ROI %",
            "Best profit",
            "Best total return",
            "Best ROI %",
          ]}
          rows={plan.partners.map((row, i) => ({
            id: row.id,
            cells: [
              { value: row.name, choices: [...knownPartners.keys()], allowCustom: true },
              choice(row.contributionType, ["Cash", "Land", "Cash + Land"]),
              moneyInput(row.capital),
              computed(totals.returns[i].capitalPercent, true),
              percentInput(
                row.profitSharePercent ?? totals.returns[i].share,
                row.profitSharePercent !== undefined,
              ),
              computed(totals.returns[i].worst.gain),
              computed(totals.returns[i].worst.total),
              computed(totals.returns[i].worst.roi, true),
              computed(totals.returns[i].best.gain),
              computed(totals.returns[i].best.total),
              computed(totals.returns[i].best.roi, true),
            ],
          }))}
          onAdd={() => update((p) => ({ ...p, partners: [...p.partners, fundingRow()] }))}
          onDelete={(row) =>
            update((p) => ({ ...p, partners: p.partners.filter((_, i) => i !== row) }))
          }
          onChange={(changes) =>
            update((p) => ({
              ...p,
              partners: revise(p.partners, changes, fundingRow, (row, col, value) => {
                if (col === 0)
                  return {
                    ...row,
                    name: value,
                    partnerId: knownPartners.get(value),
                  };
                if (col === 1)
                  return { ...row, contributionType: value as typeof row.contributionType };
                if (col === 2) return { ...row, capital: value.trim() ? parsePKR(value) : 0 };
                return {
                  ...row,
                  profitSharePercent: value.trim() ? percentValue(value) : undefined,
                };
              }),
            }))
          }
          footer={
            <span>
              Total capital PKR {formatPKR(totals.capital)} | Profit share{" "}
              {formatPercent(totals.share)}
            </span>
          }
        />
        {plan.partners.length > 0 && Math.abs(totals.share - 100) > 0.001 && (
          <p className="project-share-warning" role="status">
            Profit shares total {formatPercent(totals.share)}. You can save and adjust them later.
          </p>
        )}
        {(["min", "max"] as const).map((side) => (
          <p
            key={side}
            className={`feasibility-total ${totals.gap[side] > 0 ? "funding-gap" : "funding-covered"}`}
          >
            Funding gap ({side} cost case) <strong>PKR {formatPKR(totals.gap[side])}</strong>
          </p>
        ))}
      </Section>
      <Section title="Summary">
        <Metrics
          values={[
            ...values,
            [
              "Break-even",
              `Worst ${formatPercent(totals.breakEven.worst)} / Best ${formatPercent(totals.breakEven.best)}`,
            ],
          ]}
        />
        <FeasibilityGrid
          groups={[
            { label: "Partner funding", columns: 2 },
            { label: "Worst case", columns: 3 },
            { label: "Best case", columns: 3 },
          ]}
          headers={[
            "Partner",
            "Invested (PKR)",
            "Worst profit",
            "Worst return",
            "Worst ROI %",
            "Best profit",
            "Best return",
            "Best ROI %",
          ]}
          locked
          onChange={() => {}}
          rows={plan.partners.map((row, i) => ({
            id: row.id,
            cells: [
              { value: row.name || "Unnamed partner" },
              computed(row.capital),
              computed(totals.returns[i].worst.gain),
              computed(totals.returns[i].worst.total),
              computed(totals.returns[i].worst.roi, true),
              computed(totals.returns[i].best.gain),
              computed(totals.returns[i].best.total),
              computed(totals.returns[i].best.roi, true),
            ],
          }))}
          footer={!plan.partners.length ? "No partners added yet." : undefined}
        />
      </Section>
    </div>
  );
}
