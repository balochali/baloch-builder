import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import {
  landCategories,
  landCategoryLabels,
  landSourceLabels,
  landSourceTypes,
  splitTotal,
  paymentProblem,
  landPurchaseSchema,
  landPaymentSchema,
  landCostSchema,
  landContributionSchema,
  type LandSheet,
  type LandSource,
  type LandParcel,
  type LandPurchase,
  type LandPayment,
  type LandCost,
  type LandContribution,
  type LandFigures,
} from "@baloch/shared";
import { api } from "@/data/api";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { FundingTable, Metrics, Money } from "./FundingUI";
import "./land.css";
export function useLandSheet(id: string, enabled: boolean) {
  const [sheet, setSheet] = useState<LandSheet>();
  const [error, setError] = useState("");
  async function refresh() {
    try {
      setSheet(await api<LandSheet>(`projects/${id}/land`));
      setError("");
    } catch (e) {
      setError(String(e));
    }
  }
  useEffect(() => {
    let live = true;
    if (enabled)
      api<LandSheet>(`projects/${id}/land`)
        .then((s) => {
          if (live) setSheet(s);
        })
        .catch((e) => {
          if (live) setError(String(e));
        });
    return () => {
      live = false;
    };
  }, [id, enabled]);
  return { sheet, error, refresh };
}
export function LandMetrics({ figures }: { figures: LandFigures }) {
  return (
    <Metrics
      values={[
        ["Agreed price", <Money value={figures.agreedPrice} />],
        ["Paid so far", <Money value={figures.totalPaid} />],
        ["Remaining", <Money value={figures.remaining} />],
        ["Related costs", <Money value={figures.relatedCosts} />],
        ["Total land cost", <Money value={figures.totalLandCost} />],
      ]}
    />
  );
}
export function LandBreakdown({ figures }: { figures: LandFigures }) {
  return (
    <section className="land-breakdown">
      <h4>Where the land money came from</h4>
      {figures.breakdown.length ? (
        <>
          <div
            className="land-stacked"
            role="img"
            aria-label={figures.breakdown
              .map((s) => `${s.label}: ${s.percentage.toFixed(1)}%`)
              .join(", ")}
          >
            {figures.breakdown.map((s, i) => (
              <span
                key={s.key}
                style={{ width: `${s.percentage}%`, background: `var(--land-color-${i % 5})` }}
                title={`${s.label}: ${s.amount.toLocaleString()} PKR`}
              />
            ))}
          </div>
          <FundingTable headers={["Source", "Amount", "Share"]}>
            {figures.breakdown.map((s) => (
              <tr key={s.key}>
                <td>{s.label}</td>
                <td className="funding-numeric">
                  <Money value={s.amount} />
                </td>
                <td className="funding-numeric">{s.percentage.toFixed(1)}%</td>
              </tr>
            ))}
          </FundingTable>
        </>
      ) : (
        <p>No land payments or contributions recorded yet.</p>
      )}
    </section>
  );
}
type Kind = "purchase" | "payments" | "costs" | "contribution";
type RecordValue = LandPurchase | LandPayment | LandCost | LandContribution;
type FormState = { kind: Kind; record?: RecordValue };
const date = () => new Date().toLocaleDateString("en-CA");
export function LandEntryModal({
  id,
  sheet,
  parcel,
  purchase,
  form,
  close,
  saved,
}: {
  id: string;
  sheet: LandSheet;
  parcel?: LandParcel;
  purchase?: LandPurchase;
  form: FormState;
  close: () => void;
  saved: () => Promise<void>;
}) {
  const { kind, record } = form;
  const payment = kind === "payments" ? (record as LandPayment | undefined) : undefined;
  const cost = kind === "costs" ? (record as LandCost | undefined) : undefined;
  const bought = kind === "purchase" ? (record as LandPurchase | undefined) : undefined;
  const contribution =
    kind === "contribution" ? (record as LandContribution | undefined) : undefined;
  const [maxDate] = useState(() => new Date(Date.now() + 86400000).toISOString().slice(0, 10));
  const [sources, setSources] = useState<LandSource[]>(
    payment?.sources ?? (cost ? [cost.source] : [{ sourceType: "bank", amount: 0 }]),
  );
  const [seller, setSeller] = useState(bought?.sellerPartyId ?? parcel?.sellerPartyId ?? "");
  const [sellers, setSellers] = useState(sheet.sellers);
  const [newSeller, setNewSeller] = useState(false);
  const [sellerName, setSellerName] = useState("");
  const [lenders, setLenders] = useState(sheet.lenders);
  const [newLender, setNewLender] = useState(false);
  const [lenderName, setLenderName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const figures = sheet.parcels.find((p) => p.id === parcel?.id);
  const remaining = (figures?.remaining ?? 0) + (payment?.amount ?? 0);
  const total = splitTotal(sources);
  const problem =
    kind === "payments"
      ? paymentProblem(sources, remaining)
      : kind === "costs"
        ? paymentProblem(sources, Number.MAX_SAFE_INTEGER)
        : "";
  const sourceName = (s: LandSource) =>
    s.sourceType === "partner_direct"
      ? sheet.partners.find((p) => p.id === s.partnerId)?.name
      : s.sourceType === "loan_direct"
        ? lenders.find((p) => p.id === s.lenderPartyId)?.name
        : landSourceLabels[s.sourceType];
  async function contact(type: "seller" | "lender") {
    setBusy(true);
    setError("");
    try {
      const name = type === "seller" ? sellerName : lenderName;
      const value = await api<{ id: string; name: string }>(
        `projects/${id}/${type === "seller" ? "site/sellers" : "funding/lenders"}`,
        "POST",
        { name, phone: "", address: "", notes: "" },
      );
      if (type === "seller") {
        setSellers((v) => [...v, value]);
        setSeller(value.id);
        setNewSeller(false);
      } else {
        setLenders((v) => [...v, value]);
        setSources((v) =>
          v.map((s) =>
            s.sourceType === "loan_direct" && !s.lenderPartyId
              ? { ...s, lenderPartyId: value.id }
              : s,
          ),
        );
        setNewLender(false);
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || problem) return;
    const fields = new FormData(event.currentTarget);
    const value = (key: string) => String(fields.get(key) ?? "");
    const common = { notes: value("notes"), expectedVoucherId: record?.voucherId };
    const payload =
      kind === "purchase"
        ? {
            ...common,
            parcelId: parcel?.id,
            sellerPartyId: seller,
            agreedPrice: Number(value("amount")),
            agreementDate: value("date"),
          }
        : kind === "payments"
          ? {
              ...common,
              purchaseId: purchase?.id,
              paidOn: value("date"),
              reference: value("reference"),
              sources,
            }
          : kind === "costs"
            ? {
                ...common,
                purchaseId: purchase?.id ?? null,
                paidOn: value("date"),
                category: value("category"),
                source: sources[0],
              }
            : {
                ...common,
                parcelId: parcel?.id,
                agreedValue: Number(value("amount")),
                contributedOn: value("date"),
              };
    const schema =
      kind === "purchase"
        ? landPurchaseSchema
        : kind === "payments"
          ? landPaymentSchema
          : kind === "costs"
            ? landCostSchema
            : landContributionSchema;
    const parsed = schema.safeParse(payload);
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }
    setBusy(true);
    setError("");
    try {
      await api(
        `projects/${id}/land/${kind}${record ? "/" + record.id : ""}`,
        record ? "PUT" : "POST",
        parsed.data,
      );
      await saved();
      close();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  const title =
    kind === "payments"
      ? "payment"
      : kind === "costs"
        ? "cost"
        : kind === "contribution"
          ? "contribution"
          : "purchase";
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) close();
      }}
    >
      <DialogContent className="project-detail-dialog land-entry-dialog">
        <DialogTitle>
          {record ? "Edit" : kind === "purchase" || kind === "contribution" ? "Record" : "Add"}{" "}
          {title}
        </DialogTitle>
        <DialogDescription>
          {parcel?.name ?? "Project-wide land cost"} · Amounts are in whole Pakistani rupees.
        </DialogDescription>
        <form onSubmit={submit}>
          <fieldset disabled={busy} className="project-form-grid">
            <label>
              Date
              <Input
                name="date"
                type="date"
                required
                defaultValue={
                  payment?.paidOn ??
                  cost?.paidOn ??
                  bought?.agreementDate ??
                  contribution?.contributedOn ??
                  date()
                }
                max={maxDate}
              />
            </label>
            {kind === "purchase" && (
              <div className="site-contact-field">
                <label>
                  Seller
                  <select required value={seller} onChange={(e) => setSeller(e.target.value)}>
                    <option value="">Select seller</option>
                    {sellers.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  className="projects-secondary"
                  onClick={() => setNewSeller(!newSeller)}
                >
                  Add seller
                </button>
                {newSeller && (
                  <div>
                    <Input
                      aria-label="New seller name"
                      value={sellerName}
                      onChange={(e) => setSellerName(e.target.value)}
                    />
                    <button
                      className="projects-secondary"
                      type="button"
                      disabled={!sellerName.trim()}
                      onClick={() => void contact("seller")}
                    >
                      Save seller
                    </button>
                  </div>
                )}
              </div>
            )}
            {(kind === "purchase" || kind === "contribution") && (
              <label>
                {kind === "purchase" ? "Agreed price" : "Agreed land value"}
                <Input
                  name="amount"
                  type="number"
                  min="1"
                  max="1000000000000"
                  step="1"
                  required
                  defaultValue={bought?.agreedPrice ?? contribution?.agreedValue}
                />
              </label>
            )}
            {kind === "payments" && (
              <label>
                Reference
                <Input name="reference" maxLength={120} defaultValue={payment?.reference} />
              </label>
            )}
            {kind === "costs" && (
              <label>
                Category
                <select name="category" defaultValue={cost?.category ?? "registration"}>
                  {landCategories.map((c) => (
                    <option key={c} value={c}>
                      {landCategoryLabels[c]}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="project-full">
              Notes
              <Input name="notes" maxLength={2000} defaultValue={record?.notes} />
            </label>
            {(kind === "payments" || kind === "costs") && (
              <section className="project-full land-sources">
                <h3>Paid from</h3>
                <p>
                  Available: Bank <Money value={sheet.available.bank} /> · Cash{" "}
                  <Money value={sheet.available.cash} />
                </p>
                {sources.map((s, i) => (
                  <div className="land-source-row" key={i}>
                    <label>
                      Source {i + 1}
                      <select
                        value={s.sourceType}
                        onChange={(e) =>
                          setSources((v) =>
                            v.map((row, n) =>
                              n === i
                                ? {
                                    sourceType: e.target.value as LandSource["sourceType"],
                                    amount: row.amount,
                                  }
                                : row,
                            ),
                          )
                        }
                      >
                        {landSourceTypes.map((t) => (
                          <option key={t} value={t}>
                            {landSourceLabels[t]}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Amount {i + 1}
                      <Input
                        type="number"
                        min="1"
                        max="1000000000000"
                        step="1"
                        required
                        value={s.amount || ""}
                        onChange={(e) =>
                          setSources((v) =>
                            v.map((row, n) =>
                              n === i ? { ...row, amount: Number(e.target.value) } : row,
                            ),
                          )
                        }
                      />
                    </label>
                    {s.sourceType === "partner_direct" && (
                      <label>
                        Partner {i + 1}
                        <select
                          required
                          value={s.partnerId ?? ""}
                          onChange={(e) =>
                            setSources((v) =>
                              v.map((row, n) =>
                                n === i ? { ...row, partnerId: e.target.value } : row,
                              ),
                            )
                          }
                        >
                          <option value="">Select linked partner</option>
                          {sheet.partners
                            .filter((p) => p.role !== "Owner")
                            .map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.name}
                              </option>
                            ))}
                        </select>
                      </label>
                    )}
                    {s.sourceType === "loan_direct" && (
                      <label>
                        Lender {i + 1}
                        <select
                          required
                          value={s.lenderPartyId ?? ""}
                          onChange={(e) =>
                            setSources((v) =>
                              v.map((row, n) =>
                                n === i ? { ...row, lenderPartyId: e.target.value } : row,
                              ),
                            )
                          }
                        >
                          <option value="">Select lender</option>
                          {lenders.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                    {kind === "payments" && sources.length > 1 && (
                      <button
                        type="button"
                        className="projects-secondary"
                        aria-label={`Remove source ${i + 1}`}
                        onClick={() => setSources((v) => v.filter((_, n) => n !== i))}
                      >
                        Remove
                      </button>
                    )}
                  </div>
                ))}
                <div className="funding-actions">
                  {kind === "payments" && (
                    <button
                      type="button"
                      className="projects-secondary"
                      disabled={sources.length >= 30}
                      onClick={() => setSources((v) => [...v, { sourceType: "bank", amount: 0 }])}
                    >
                      Add another source
                    </button>
                  )}
                  {sources.some((s) => s.sourceType === "loan_direct") && (
                    <button
                      type="button"
                      className="projects-secondary"
                      onClick={() => setNewLender(!newLender)}
                    >
                      Add lender
                    </button>
                  )}
                </div>
                {newLender && (
                  <div>
                    <Input
                      aria-label="New lender name"
                      value={lenderName}
                      onChange={(e) => setLenderName(e.target.value)}
                    />
                    <button
                      type="button"
                      className="projects-secondary"
                      disabled={!lenderName.trim()}
                      onClick={() => void contact("lender")}
                    >
                      Save lender
                    </button>
                  </div>
                )}
                <div className="land-payment-total">
                  <strong>Payment total: {total.toLocaleString("en-PK")} PKR</strong>
                  {kind === "payments" && (
                    <span>
                      Remaining after payment: {(remaining - total).toLocaleString("en-PK")} PKR
                    </span>
                  )}
                  <small>
                    {sources
                      .filter((s) => s.amount > 0)
                      .map(
                        (s) => `${sourceName(s) ?? "Select source"} ${s.amount.toLocaleString()}`,
                      )
                      .join(" + ")}
                  </small>
                </div>
                {problem && <p role="alert">{problem}</p>}
              </section>
            )}
          </fieldset>
          {error && (
            <p role="alert" className="project-save-error">
              {error}
            </p>
          )}
          <div className="project-modal-actions">
            <button type="button" className="projects-secondary" disabled={busy} onClick={close}>
              Cancel
            </button>
            <button className="projects-primary" disabled={busy || !!problem}>
              {busy ? "Saving…" : `Save ${title}`}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
export function LandFinancePanel({
  id,
  sheet,
  parcel,
  manage,
  refresh,
}: {
  id: string;
  sheet: LandSheet;
  parcel?: LandParcel;
  manage: boolean;
  refresh: () => Promise<void>;
}) {
  const [form, setForm] = useState<FormState>();
  const [voiding, setVoiding] = useState<FormState>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const purchase = sheet.purchases.find((p) => p.parcelId === parcel?.id && p.status === "posted");
  const contribution = sheet.contributions.find(
    (c) => c.parcelId === parcel?.id && c.status === "posted",
  );
  const figures = parcel ? sheet.parcels.find((p) => p.id === parcel.id) : sheet.totals;
  const history = sheet.purchases.filter((p) => p.parcelId === parcel?.id);
  const purchaseIds = new Set(history.map((p) => p.id));
  const payments = sheet.payments.filter((p) => purchaseIds.has(p.purchaseId));
  const costs = sheet.costs.filter((c) =>
    parcel ? !!c.purchaseId && purchaseIds.has(c.purchaseId) : !c.purchaseId,
  );
  const ledger = (r: RecordValue) => (
    <Link
      className="land-ledger"
      to={`/projects/${id}/transactions?voucher=${encodeURIComponent(r.voucherId)}`}
    >
      View in ledger
    </Link>
  );
  function actions(kind: Kind, r: RecordValue) {
    return (
      <div className="funding-actions">
        {ledger(r)}
        {manage && r.status === "posted" && (
          <>
            <button className="projects-secondary" onClick={() => setForm({ kind, record: r })}>
              Edit
            </button>
            <button
              className="projects-secondary"
              onClick={() => {
                setVoiding({ kind, record: r });
                setError("");
              }}
            >
              Void
            </button>
          </>
        )}
      </div>
    );
  }
  async function voidRecord(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy || !voiding?.record) return;
    setBusy(true);
    try {
      await api(`projects/${id}/land/${voiding.kind}/${voiding.record.id}/void`, "POST", {
        reason: new FormData(e.currentTarget).get("reason"),
        expectedVoucherId: voiding.record.voucherId,
      });
      await refresh();
      setVoiding(undefined);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="land-finances">
      {figures && (
        <>
          <LandMetrics figures={figures} />
          <LandBreakdown figures={figures} />
        </>
      )}
      {parcel && (
        <>
          <div className="project-section-heading">
            <h4>
              {parcel.acquisitionType === "purchase" ? "Purchase agreement" : "Land contribution"}
            </h4>
            {manage && !purchase && !contribution && (
              <button
                className="projects-primary"
                onClick={() =>
                  setForm({
                    kind: parcel.acquisitionType === "purchase" ? "purchase" : "contribution",
                  })
                }
              >
                {parcel.acquisitionType === "purchase" ? "Record purchase" : "Record contribution"}
              </button>
            )}
          </div>
          {purchase ? (
            <div className="land-agreement">
              <p>
                {sheet.sellers.find((s) => s.id === purchase.sellerPartyId)?.name} ·{" "}
                {purchase.agreementDate} · <Money value={purchase.agreedPrice} />
              </p>
              {actions("purchase", purchase)}
            </div>
          ) : contribution ? (
            <div className="land-agreement">
              <p>
                {sheet.partners.find((s) => s.id === contribution.partnerId)?.name} ·{" "}
                <Money value={contribution.agreedValue} />
              </p>
              {actions("contribution", contribution)}
            </div>
          ) : (
            <p>
              Record the{" "}
              {parcel.acquisitionType === "purchase" ? "purchase agreement" : "contribution value"}{" "}
              to start tracking this parcel.
            </p>
          )}
          {(purchase || payments.length > 0) && (
            <>
              <div className="project-section-heading">
                <h4>Payments</h4>
                {manage && purchase && (
                  <button
                    className="projects-primary"
                    onClick={() => setForm({ kind: "payments" })}
                  >
                    Add payment
                  </button>
                )}
              </div>
              {payments.length ? (
                <FundingTable
                  headers={["Date", "Reference", "Sources", "Amount", "Status", "Actions"]}
                >
                  {payments.map((p) => (
                    <tr key={p.id} className={p.status === "void" ? "funding-void" : ""}>
                      <td>{p.paidOn}</td>
                      <td>{p.reference || "—"}</td>
                      <td className="land-sources-summary">
                        {p.sources.map((s, i) => (
                          <span key={i}>
                            {i > 0 ? " + " : ""}
                            {s.sourceType === "partner_direct"
                              ? `${sheet.partners.find((x) => x.id === s.partnerId)?.name ?? "Partner"}`
                              : s.sourceType === "loan_direct"
                                ? sheet.lenders.find((x) => x.id === s.lenderPartyId)?.name
                                : landSourceLabels[s.sourceType]}{" "}
                            <Money value={s.amount} />
                          </span>
                        ))}
                      </td>
                      <td>
                        <Money value={p.amount} />
                      </td>
                      <td>{p.status}</td>
                      <td>{actions("payments", p)}</td>
                    </tr>
                  ))}
                </FundingTable>
              ) : (
                <p>No payments recorded; add the first instalment.</p>
              )}
            </>
          )}
          {history.some((p) => p.status === "void") && (
            <details>
              <summary>Previous purchase agreements</summary>
              {history
                .filter((p) => p.status === "void")
                .map((p) => (
                  <p key={p.id}>
                    {p.agreementDate} · Void · {ledger(p)}
                  </p>
                ))}
            </details>
          )}
        </>
      )}
      <div className="project-section-heading">
        <h4>{parcel ? "Related costs" : "Project-wide related costs"}</h4>
        {manage && (!parcel || purchase) && (
          <button className="projects-secondary" onClick={() => setForm({ kind: "costs" })}>
            Add cost
          </button>
        )}
      </div>
      {costs.length ? (
        <FundingTable headers={["Date", "Category", "Paid from", "Amount", "Status", "Actions"]}>
          {costs.map((c) => (
            <tr key={c.id} className={c.status === "void" ? "funding-void" : ""}>
              <td>{c.paidOn}</td>
              <td>{landCategoryLabels[c.category]}</td>
              <td>{landSourceLabels[c.source.sourceType]}</td>
              <td>
                <Money value={c.amount} />
              </td>
              <td>{c.status}</td>
              <td>{actions("costs", c)}</td>
            </tr>
          ))}
        </FundingTable>
      ) : (
        <p>No related costs recorded yet.</p>
      )}
      {form && (
        <LandEntryModal
          id={id}
          sheet={sheet}
          parcel={parcel}
          purchase={purchase}
          form={form}
          close={() => setForm(undefined)}
          saved={refresh}
        />
      )}
      {voiding && (
        <Dialog
          open
          onOpenChange={(open) => {
            if (!open && !busy) setVoiding(undefined);
          }}
        >
          <DialogContent className="project-detail-dialog">
            <DialogTitle>Void {voiding.record?.voucherId}</DialogTitle>
            <DialogDescription>
              The record stays in history. A reversal will undo its accounting effect.
            </DialogDescription>
            <form onSubmit={voidRecord}>
              <label>
                Reason
                <Input name="reason" required maxLength={250} />
              </label>
              {error && <p role="alert">{error}</p>}
              <div className="project-modal-actions">
                <button
                  type="button"
                  className="projects-secondary"
                  disabled={busy}
                  onClick={() => setVoiding(undefined)}
                >
                  Cancel
                </button>
                <button className="projects-primary" disabled={busy}>
                  Confirm void
                </button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      )}
    </section>
  );
}
