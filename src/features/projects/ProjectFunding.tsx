import { useEffect, useState, type FormEvent } from "react";
import { feasibilitySchema, type MasterPartner, type MoneyEntry } from "@baloch/shared";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { api } from "@/data/api";
import { calculateFeasibility } from "./feasibilityCalc";
import { formatPercent } from "./feasibilityFormat";
import { FundingTable, JournalTable, Metrics, Money, downloadFundingFile } from "./FundingUI";
import {
  balance,
  bankLabel,
  commitmentFigures,
  isFunding,
  loanOutstanding,
  partnerTotals,
  payoutLabels,
  sum,
  validLines,
} from "./fundingView";
import { MoneyEntryForm, type FundingData } from "./MoneyEntryForm";
import { PartnerEditor } from "./PartnersMaster";

const sections = ["Partners", "Money in", "Money out"] as const;
const inflowLabels: Record<string, string> = {
  partner: "Partner",
  owner: "Owner",
  loan: "Loan",
  customer_booking: "Customer booking",
};
function direct(entry: MoneyEntry) {
  return "receivedInto" in entry.data && entry.data.receivedInto === "direct_payment";
}
function Statement({
  sheet,
  partner,
  close,
}: {
  sheet: FundingData;
  partner: FundingData["partners"][number];
  close: () => void;
}) {
  const rows = validLines(sheet.lines).filter(
    (l) => l.partnerId === partner.id && ["3000", "3100"].includes(l.accountCode),
  );
  let running = 0;
  const statementRows = [];
  for (const row of rows) {
    if (row.accountCode === "3000") running += row.credit - row.debit;
    statementRows.push({ row, running });
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <DialogContent className="project-detail-dialog funding-statement">
        <DialogTitle>{partner.name} statement</DialogTitle>
        <DialogDescription>
          Contributions and payouts on this project. Running balance shows capital still held.
        </DialogDescription>
        {!rows.length ? (
          <p>No money entries yet.</p>
        ) : (
          <FundingTable
            headers={["Date", "Voucher", "Entry", "Money in", "Money out", "Running capital"]}
          >
            {statementRows.map(({ row, running }) => {
              return (
                <tr key={row.id}>
                  <td>{row.date}</td>
                  <td>{row.voucherId}</td>
                  <td>{row.narration}</td>
                  <td className="funding-numeric">
                    {row.credit ? <Money value={row.credit} /> : "—"}
                  </td>
                  <td className="funding-numeric">
                    {row.debit ? <Money value={row.debit} /> : "—"}
                  </td>
                  <td className="funding-numeric">
                    <Money value={running} />
                  </td>
                </tr>
              );
            })}
          </FundingTable>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function ProjectFunding({
  id,
  tab,
  manage,
}: {
  id: string;
  tab: "partners" | "transactions";
  manage: boolean;
}) {
  const endpoint = `projects/${id}/funding`;
  const [sheet, setSheet] = useState<FundingData>();
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const [section, setSection] = useState<(typeof sections)[number]>("Partners");
  const [entryForm, setEntryForm] = useState<{ direction: "in" | "out"; entry?: MoneyEntry }>();
  const [statement, setStatement] = useState<FundingData["partners"][number]>();
  const [link, setLink] = useState(false);
  const [partnerId, setPartnerId] = useState("");
  const [quick, setQuick] = useState(false);
  const [voiding, setVoiding] = useState<MoneyEntry>();
  const [busy, setBusy] = useState(false);
  const [dialogError, setDialogError] = useState("");
  const refresh = () => setReload((value) => value + 1);
  useEffect(() => {
    let active = true;
    api<FundingData>(endpoint)
      .then((value) => {
        if (active) {
          setSheet(value);
          setError("");
        }
      })
      .catch((cause) => {
        if (active) setError(String(cause));
      });
    return () => {
      active = false;
    };
  }, [endpoint, reload]);
  async function linkPartner(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !partnerId) return;
    setBusy(true);
    setDialogError("");
    try {
      await api(endpoint + "/partners", "POST", { partnerId });
      setLink(false);
      refresh();
    } catch (cause) {
      setDialogError(String(cause));
    } finally {
      setBusy(false);
    }
  }
  async function voidEntry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!voiding || busy) return;
    const reason = String(new FormData(event.currentTarget).get("reason") ?? "").trim();
    if (!reason) {
      setDialogError("Enter a reason.");
      return;
    }
    setBusy(true);
    setDialogError("");
    try {
      await api(endpoint + `/${voiding.id}/void`, "POST", { reason });
      setVoiding(undefined);
      refresh();
    } catch (cause) {
      setDialogError(String(cause));
    } finally {
      setBusy(false);
    }
  }
  function addPartner(partner: MasterPartner) {
    setSheet((current) =>
      current ? { ...current, partners: [...current.partners, partner] } : current,
    );
    setPartnerId(partner.id);
  }
  if (!sheet)
    return <p role={error ? "alert" : "status"}>{error || "Loading project funding..."}</p>;
  if (tab === "transactions")
    return (
      <>
        {error && <p role="alert">{error}</p>}
        <JournalTable lines={sheet.lines} />
      </>
    );

  const parsed = sheet.plan ? feasibilitySchema.safeParse(sheet.plan) : undefined;
  const plan = parsed?.success ? parsed.data : null;
  const forecast = plan ? calculateFeasibility(plan) : null;
  const active = validLines(sheet.lines);
  const totals = partnerTotals(active);
  const committed = sum(plan?.partners.map((p) => p.capital) ?? []);
  const planPartner = (id: string, name: string) =>
    plan?.partners
      .map((row, i) => ({ row, i }))
      .filter(
        ({ row }) =>
          row.partnerId === id ||
          (!row.partnerId && row.name.trim().toLowerCase() === name.trim().toLowerCase()),
      ) ?? [];
  const linked = sheet.partners.filter(
    (p) =>
      sheet.links.includes(p.id) ||
      active.some((l) => l.partnerId === p.id) ||
      planPartner(p.id, p.name).length,
  );
  const pendingByPartner = linked.flatMap((partner) => {
    const planned = planPartner(partner.id, partner.name);
    return planned.length
      ? [
          commitmentFigures(
            sum(planned.map(({ row }) => row.capital)),
            partnerTotals(active, partner.id).contributed,
          ),
        ]
      : [];
  });
  const direction = section === "Money in" ? "in" : "out";
  const entries = sheet.entries.filter((entry) => entry.direction === direction);
  const posted = entries.filter((entry) => entry.status === "posted");
  const voided = entries.filter((entry) => entry.status === "void");
  function entryName(entry: MoneyEntry) {
    const partner = sheet!.partners.find((p) => p.id === entry.data.partnerId);
    if (partner) return partner.name;
    if (isFunding(entry))
      return sheet!.lenders.find((l) => l.id === entry.data.lenderPartyId)?.name ?? "—";
    return sheet!.lines.find((l) => l.voucherId === entry.voucherId && l.party)?.party ?? "—";
  }
  function entryTable(rows: MoneyEntry[]) {
    const inflow = direction === "in";
    const headers = [
      "Date",
      inflow ? "Source type" : "Kind",
      inflow ? "Source name" : "Paid to",
      "Amount",
      ...(inflow ? ["Purpose"] : []),
      inflow ? "Received into" : "Paid from",
      "Reference",
      "Status",
      "Actions",
    ];
    return (
      <FundingTable headers={headers}>
        {rows.map((entry) => (
          <tr key={entry.id} className={entry.status === "void" ? "funding-void" : undefined}>
            <td>{entry.data.date}</td>
            <td>
              {isFunding(entry)
                ? (inflowLabels[entry.data.sourceType] ?? entry.data.sourceType)
                : payoutLabels[
                    (entry.data as MoneyEntry["data"] & { kind: keyof typeof payoutLabels }).kind
                  ]}
            </td>
            <td>{entryName(entry)}</td>
            <td className="funding-numeric">
              <Money value={entry.data.amount} />
            </td>
            {inflow && <td>{isFunding(entry) ? entry.data.purpose : "—"}</td>}
            <td>{direct(entry) ? "Paid directly" : bankLabel(entry.data.account)}</td>
            <td>{entry.data.refNo || "—"}</td>
            <td>
              <span className="project-status">
                {entry.status === "void" ? "Void" : direct(entry) ? "Paid directly" : "Posted"}
              </span>
            </td>
            <td>
              <div className="funding-actions">
                {entry.attachmentId && (
                  <button
                    className="projects-secondary"
                    onClick={() =>
                      void downloadFundingFile(`projects/${id}/files/${entry.attachmentId}`).catch(
                        (cause) => setError(String(cause)),
                      )
                    }
                  >
                    Attachment
                  </button>
                )}
                {manage && entry.status === "posted" && !direct(entry) && (
                  <>
                    <button
                      className="projects-secondary"
                      onClick={() => setEntryForm({ direction, entry })}
                    >
                      Edit
                    </button>
                    <button
                      className="projects-secondary"
                      onClick={() => {
                        setVoiding(entry);
                        setDialogError("");
                      }}
                    >
                      Void
                    </button>
                  </>
                )}
              </div>
            </td>
          </tr>
        ))}
      </FundingTable>
    );
  }
  const loans = sheet.entries.filter(
    (entry) => entry.status === "posted" && isFunding(entry) && entry.data.sourceType === "loan",
  );
  const inflows = posted.filter(isFunding);
  return (
    <section className="project-site">
      <h2>Project partners & funding</h2>
      {error && (
        <p role="alert" className="project-save-error">
          {error}
        </p>
      )}
      <Metrics
        values={[
          ["Total committed", <Money value={committed} />],
          ["Total contributed", <Money value={totals.contributed} />],
          [
            "Still pending",
            pendingByPartner.length ? (
              <Money value={sum(pendingByPartner.map((row) => row.pending ?? 0))} />
            ) : (
              "—"
            ),
          ],
          [
            "Extra contributed",
            pendingByPartner.length ? (
              <Money value={sum(pendingByPartner.map((row) => row.extra ?? 0))} />
            ) : (
              "—"
            ),
          ],
          ["Returned so far", <Money value={totals.returned} />],
          ["Loans outstanding", <Money value={-balance(active, "2300")} />],
          [
            "Project funds available",
            <Money value={balance(active, "1000") + balance(active, "1010")} />,
          ],
        ]}
      />
      <div className="funding-pills" aria-label="Funding sections">
        {sections.map((name) => (
          <button
            className="projects-secondary"
            aria-pressed={name === section}
            key={name}
            onClick={() => setSection(name)}
          >
            {name}
          </button>
        ))}
      </div>
      {section === "Partners" ? (
        <section className="project-detail-panel">
          <div className="project-section-heading">
            <h3>Partners</h3>
            {manage && (
              <button
                className="projects-primary"
                onClick={() => {
                  setLink(true);
                  setPartnerId("");
                  setDialogError("");
                }}
              >
                Add partner to project
              </button>
            )}
          </div>
          {!linked.length ? (
            <p>No partners linked yet. Add a partner or assign one in Feasibility.</p>
          ) : (
            <FundingTable
              headers={[
                "Partner",
                "Role",
                "Profit share",
                "Committed",
                "Contributed",
                "Progress",
                "Pending",
                "Extra contributed",
                "Capital returned",
                "Profit received",
                "Expected profit worst / best",
                "ROI so far",
              ]}
            >
              {linked.map((partner) => {
                const expected = planPartner(partner.id, partner.name);
                const shares = sum(expected.map(({ i }) => forecast!.returns[i].share));
                const capital = expected.length
                  ? sum(expected.map(({ row }) => row.capital))
                  : null;
                const actual = partnerTotals(active, partner.id);
                const { pending, extra } = commitmentFigures(capital, actual.contributed);
                const progress = capital ? (actual.contributed / capital) * 100 : null;
                return (
                  <tr
                    key={partner.id}
                    onClick={() => setStatement(partner)}
                    className="funding-clickable"
                  >
                    <td>
                      <button
                        className="funding-name"
                        onClick={(event) => {
                          event.stopPropagation();
                          setStatement(partner);
                        }}
                      >
                        {partner.name}
                      </button>
                    </td>
                    <td>{partner.role}</td>
                    <td className="funding-numeric">
                      {formatPercent(expected.length ? shares : null)}
                    </td>
                    <td className="funding-numeric">
                      {capital === null ? "—" : <Money value={capital} />}
                    </td>
                    <td className="funding-numeric">
                      <Money value={actual.contributed} />
                    </td>
                    <td>
                      {progress === null ? (
                        "—"
                      ) : (
                        <>
                          <progress
                            aria-label={partner.name + " contributed vs committed"}
                            className="funding-progress"
                            value={Math.min(100, progress)}
                            max={100}
                          />{" "}
                          {formatPercent(progress)}
                        </>
                      )}
                    </td>
                    <td className="funding-numeric">
                      {pending === null ? "—" : <Money value={pending} />}
                    </td>
                    <td className="funding-numeric">
                      {extra === null ? "—" : <Money value={extra} />}
                    </td>
                    <td className="funding-numeric">
                      <Money value={actual.returned} />
                    </td>
                    <td className="funding-numeric">
                      <Money value={actual.profit} />
                    </td>
                    <td className="funding-numeric">
                      {forecast && expected.length ? (
                        <>
                          <Money value={(forecast.profit.worst * shares) / 100} /> /{" "}
                          <Money value={(forecast.profit.best * shares) / 100} />
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="funding-numeric">
                      {formatPercent(
                        actual.contributed ? (actual.profit / actual.contributed) * 100 : null,
                      )}
                    </td>
                  </tr>
                );
              })}
            </FundingTable>
          )}
        </section>
      ) : (
        <section className="project-detail-panel">
          <div className="project-section-heading">
            <h3>{section}</h3>
            {manage && (
              <button className="projects-primary" onClick={() => setEntryForm({ direction })}>
                Add money {direction}
              </button>
            )}
          </div>
          {posted.length ? entryTable(posted) : <p>No money {direction} entries yet.</p>}
          {direction === "in" && inflows.length > 0 && (
            <div className="funding-footer">
              <Metrics
                values={["partner", "owner", "loan"].map((type) => [
                  inflowLabels[type],
                  <Money
                    value={sum(
                      inflows.filter((e) => e.data.sourceType === type).map((e) => e.data.amount),
                    )}
                  />,
                ])}
              />
              <Metrics
                values={["Land", "Construction", "General"].map((purpose) => [
                  purpose,
                  <Money
                    value={sum(
                      inflows.filter((e) => e.data.purpose === purpose).map((e) => e.data.amount),
                    )}
                  />,
                ])}
              />
            </div>
          )}
          {direction === "in" && loans.length > 0 && (
            <>
              <h3>Loans</h3>
              <FundingTable
                headers={[
                  "Lender",
                  "Loan type",
                  "Principal",
                  "Outstanding",
                  "Annual markup",
                  "Due date",
                ]}
              >
                {loans.filter(isFunding).map((loan) => (
                  <tr key={loan.id}>
                    <td>{entryName(loan)}</td>
                    <td>{loan.data.loanTerms?.loanType ?? "—"}</td>
                    <td className="funding-numeric">
                      <Money value={loan.data.amount} />
                    </td>
                    <td className="funding-numeric">
                      <Money
                        value={loanOutstanding(
                          sheet.entries,
                          sheet.lines,
                          loan.data.loanKey ?? loan.id,
                        )}
                      />
                    </td>
                    <td>{formatPercent(loan.data.loanTerms?.markupPercent ?? null)}</td>
                    <td>{loan.data.loanTerms?.dueDate || "—"}</td>
                  </tr>
                ))}
              </FundingTable>
            </>
          )}
          {voided.length > 0 && (
            <details className="funding-details">
              <summary>Voided entries ({voided.length})</summary>
              {entryTable(voided)}
            </details>
          )}
        </section>
      )}
      {entryForm && (
        <MoneyEntryForm
          endpoint={endpoint}
          direction={entryForm.direction}
          entry={entryForm.entry}
          sheet={sheet}
          close={() => setEntryForm(undefined)}
          onSaved={refresh}
          onLender={(lender) =>
            setSheet((current) =>
              current ? { ...current, lenders: [...current.lenders, lender] } : current,
            )
          }
        />
      )}
      {statement && (
        <Statement sheet={sheet} partner={statement} close={() => setStatement(undefined)} />
      )}
      {link && (
        <Dialog
          open
          onOpenChange={(open) => {
            if (!open && !busy) setLink(false);
          }}
        >
          <DialogContent className="project-detail-dialog">
            <DialogTitle>Add partner to project</DialogTitle>
            <DialogDescription>Choose a shared partner record or create one.</DialogDescription>
            <form onSubmit={linkPartner}>
              <label className="project-form-grid">
                Partner
                <select
                  value={partnerId}
                  onChange={(event) => setPartnerId(event.target.value)}
                  required
                >
                  <option value="">Select partner</option>
                  {sheet.partners
                    .filter((p) => p.status === "Active" && !linked.some((l) => l.id === p.id))
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                </select>
              </label>
              {dialogError && <p role="alert">{dialogError}</p>}
              <div className="project-modal-actions">
                <button
                  type="button"
                  className="projects-secondary"
                  disabled={busy}
                  onClick={() => setQuick(true)}
                >
                  Quick-add partner
                </button>
                <button className="projects-primary" disabled={busy || !partnerId}>
                  Link partner
                </button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      )}
      {quick && <PartnerEditor close={() => setQuick(false)} onSaved={addPartner} />}
      {voiding && (
        <Dialog
          open
          onOpenChange={(open) => {
            if (!open && !busy) setVoiding(undefined);
          }}
        >
          <DialogContent className="project-detail-dialog">
            <DialogTitle>Void {voiding.voucherId}</DialogTitle>
            <DialogDescription>
              This entry stays in the history. A reversal will undo its effect on balances.
            </DialogDescription>
            <form onSubmit={voidEntry}>
              <label>
                Reason
                <Input name="reason" required autoFocus maxLength={250} />
              </label>
              {dialogError && <p role="alert">{dialogError}</p>}
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
