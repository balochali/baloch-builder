import { useEffect, useState } from "react";
import { ArrowDownRight, ArrowUpRight, Calculator, ChartNoAxesCombined, CircleDollarSign, Plus, Users, Wallet } from "lucide-react";
import { listProjectSales, type ProjectSale } from "@/data/repositories/projectSalesRepository";
import { listPartnerPayouts, type PartnerPayout } from "@/data/repositories/projectPayoutsRepository";
import type { ProjectPartnerRow } from "@/data/repositories/projectPartnersRepository";
import type { Transaction } from "@/domain/types";
import { formatPKR, formatPKRInLakhCrore } from "@/domain/money";
import { formatDate } from "@/lib/dates";
import { PartnerPayoutDialog } from "./PartnerPayoutDialog";
import "./project-profit-loss.css";

export function calculateProjectResult(sales: Pick<ProjectSale, "price">[], costs: Pick<Transaction, "amount">[], partners: Pick<ProjectPartnerRow, "name" | "share_bp">[]) {
  const saleValue = sales.reduce((total, sale) => total + sale.price, 0);
  const spent = costs.reduce((total, cost) => total + cost.amount, 0);
  const result = saleValue - spent;
  const allocations = partners.map((partner) => ({
    name: partner.name,
    share_bp: partner.share_bp,
    amount: Math.trunc(result * partner.share_bp / 10_000),
  }));
  return { saleValue, spent, result, allocations,
    unallocated: result - allocations.reduce((total, partner) => total + partner.amount, 0) };
}

export function calculatePartnerPosition(partner: Pick<ProjectPartnerRow, "agreed_contribution" | "contributed">, allocation: number, payouts: Pick<PartnerPayout, "amount" | "payout_purpose">[]) {
  const profitPaid = payouts.filter((payout) => payout.payout_purpose === "profit").reduce((sum, payout) => sum + payout.amount, 0);
  const capitalReturned = payouts.filter((payout) => payout.payout_purpose === "capital_return").reduce((sum, payout) => sum + payout.amount, 0);
  return { given: partner.contributed, promisedRemaining: partner.agreed_contribution === null ? null : Math.max(0, partner.agreed_contribution - partner.contributed), profitPaid, capitalReturned, received: profitPaid + capitalReturned, capitalOutstanding: Math.max(0, partner.contributed - capitalReturned), illustrativeProfitRemaining: Math.max(0, allocation - profitPaid) };
}

export function ProjectProfitLossPanel({ projectId, costs, partners, contributions }: { projectId: string; costs: Transaction[]; partners: ProjectPartnerRow[]; contributions: Transaction[] }) {
  const [sales, setSales] = useState<ProjectSale[]>([]);
  const [payouts, setPayouts] = useState<PartnerPayout[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<ProjectPartnerRow | null>(null);
  useEffect(() => {
    let active = true;
    Promise.all([listProjectSales(projectId), listPartnerPayouts(projectId)])
      .then(([saleRows, payoutRows]) => { if (active) { setSales(saleRows); setPayouts(payoutRows); } })
      .catch(() => { if (active) setError("Could not load sales or partner payouts. The project result is unavailable right now."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [projectId]);

  const summary = calculateProjectResult(sales, costs, partners);
  const scale = Math.max(summary.saleValue, summary.spent, 1);
  const resultLabel = summary.result > 0 ? "Profit" : summary.result < 0 ? "Loss" : "Break-even";
  const hasRecords = sales.length > 0 || costs.length > 0;
  const status = !hasRecords ? "No result yet" : resultLabel;
  const totalGiven = partners.reduce((sum, partner) => sum + partner.contributed, 0);
  const totalReturned = payouts.reduce((sum, payout) => sum + payout.amount, 0);

  return <section id="project-panel-profit" role="tabpanel" aria-labelledby="project-tab-profit" className="project-profit">
    <header className="project-profit-hero"><span className="project-profit-hero-icon"><ChartNoAxesCombined size={28} /></span><div><small>PROJECT OUTCOME</small><h2>Profit & Loss</h2><p>Compare agreed sales with recorded project costs, then see each partner’s share of the difference.</p></div><b className={summary.result < 0 ? "is-loss" : "is-profit"}>{status}</b></header>
    {loading ? <p className="project-profit-state" role="status">Loading project result…</p> : error ? <p className="project-profit-state" role="alert">{error}</p> : <>
      <div className="project-profit-metrics">
        <div className="project-profit-metric is-sales"><span><CircleDollarSign size={23} /></span><small>Agreed sales</small><strong>{formatPKRInLakhCrore(summary.saleValue)}</strong><p>{sales.length} sold {sales.length === 1 ? "unit" : "units"} · contract prices</p></div>
        <div className="project-profit-metric is-cost"><span><Wallet size={23} /></span><small>Project costs</small><strong>{formatPKRInLakhCrore(summary.spent)}</strong><p>{costs.length} recorded {costs.length === 1 ? "payment" : "payments"}, including land</p></div>
        <div className={`project-profit-metric ${summary.result < 0 ? "is-loss" : "is-result"}`}><span>{summary.result < 0 ? <ArrowDownRight size={23} /> : <ArrowUpRight size={23} />}</span><small>Current difference</small><strong>{hasRecords ? formatPKRInLakhCrore(summary.result) : "—"}</strong><p>Agreed sales less costs recorded so far</p></div>
      </div>
      <div className="project-profit-columns">
        <section className="project-profit-card"><div className="project-profit-card-title"><span><Calculator size={20} /></span><div><h3>How the result is calculated</h3><p>Sale agreements compared with recorded spending</p></div></div><div className="project-profit-bars"><div><span>Agreed sales <strong>{formatPKR(summary.saleValue)}</strong></span><i><b className="is-sales" style={{ width: `${summary.saleValue / scale * 100}%` }} /></i></div><div><span>Total project costs <strong>{formatPKR(summary.spent)}</strong></span><i><b className="is-cost" style={{ width: `${summary.spent / scale * 100}%` }} /></i></div></div><div className="project-profit-equation"><div><small>Agreed sales</small><strong>{formatPKR(summary.saleValue)}</strong></div><span>−</span><div><small>Costs</small><strong>{formatPKR(summary.spent)}</strong></div><span>=</span><div><small>Current difference</small><strong className={summary.result < 0 ? "is-loss" : "is-profit"}>{formatPKR(summary.result)}</strong></div></div><p className="project-profit-note">This is a planning view based on signed sale values and costs paid so far. Sale collections, unpaid bills, unsold units and tax are not tracked here, so this is not finalized cash profit.</p></section>
        <section className="project-profit-card"><div className="project-profit-card-title"><span><Users size={20} /></span><div><h3>Partner allocation</h3><p>Illustrative share of the current result</p></div></div>{partners.length ? <div className="project-profit-partners">{summary.allocations.map((partner, index) => <div className="project-profit-partner" key={`${partner.name}-${index}`}><span className="project-profit-avatar">{partner.name.slice(0, 1).toUpperCase()}</span><div><span><strong>{partner.name}</strong><small>{(partner.share_bp / 100).toFixed(2)}% share</small></span><i><b style={{ width: `${partner.share_bp / 100}%` }} /></i></div><strong className={partner.amount < 0 ? "is-loss" : ""}>{formatPKR(partner.amount)}</strong></div>)}{summary.unallocated !== 0 && <div className="project-profit-unallocated"><span>Unassigned / rounding balance</span><strong>{formatPKR(summary.unallocated)}</strong></div>}</div> : <div className="project-profit-no-partners"><Users size={27} /><strong>No partners added</strong><p>Add partners and their ownership shares to see the allocation.</p></div>}<p className="project-profit-note">These amounts follow ownership shares; they are not payments made to partners. Partner contributions fund the project and are not counted as sales income.</p></section>
      </div>
      <section className="project-profit-card"><div className="project-profit-card-title"><span><Users size={20} /></span><div><h3>Partner money & payouts</h3><p>Actual contributions and returns for every partner</p></div></div>
        {partners.length ? <><div className="project-profit-totals"><div><small>Given by partners</small><strong>{formatPKR(totalGiven)}</strong></div><div><small>Paid back to partners</small><strong>{formatPKR(totalReturned)}</strong></div><div><small>Capital still with project</small><strong>{formatPKR(Math.max(0, totalGiven - payouts.filter((p) => p.payout_purpose === "capital_return").reduce((sum, p) => sum + p.amount, 0)))}</strong></div></div><div className="project-profit-detail-grid">{partners.map((partner) => {
          const partnerPayouts = payouts.filter((payout) => payout.partner_id === partner.partner_id);
          const partnerContributions = contributions.filter((contribution) => contribution.partner_id === partner.partner_id);
          const allocation = Math.trunc(summary.result * partner.share_bp / 10_000);
          const position = calculatePartnerPosition(partner, allocation, partnerPayouts);
          return <article className="project-profit-detail" key={partner.partnership_id}><div className="project-profit-detail-head"><span className="project-profit-avatar">{partner.name.slice(0, 1).toUpperCase()}</span><div><h4>{partner.name}</h4><small>{(partner.share_bp / 100).toFixed(2)}% ownership share</small></div><button type="button" onClick={() => { setSelected(partner); }}><Plus size={15} /> Record payout</button></div>
            <div className="project-profit-detail-stats"><div><small>Promised</small><strong>{partner.agreed_contribution === null ? "Not set" : formatPKR(partner.agreed_contribution)}</strong></div><div><small>Given to project</small><strong>{formatPKR(position.given)}</strong></div><div><small>Still promised</small><strong>{position.promisedRemaining === null ? "—" : formatPKR(position.promisedRemaining)}</strong></div><div><small>Got back in total</small><strong>{formatPKR(position.received)}</strong></div><div><small>Capital returned</small><strong>{formatPKR(position.capitalReturned)}</strong></div><div><small>Profit paid</small><strong>{formatPKR(position.profitPaid)}</strong></div></div>
            <div className="project-profit-detail-result"><div><small>Illustrative share of current {summary.result < 0 ? "loss" : "profit"}</small><strong>{formatPKR(allocation)}</strong></div><div><small>Capital still with project</small><strong>{formatPKR(position.capitalOutstanding)}</strong></div>{allocation > 0 && <div><small>Illustrative profit not yet paid</small><strong>{formatPKR(position.illustrativeProfitRemaining)}</strong></div>}</div>
            <details className="project-profit-history"><summary>Money history · {partnerContributions.length} received, {partnerPayouts.length} paid out</summary>{partnerContributions.length + partnerPayouts.length ? <div>{[...partnerContributions.map((item) => ({ id: item.id, date: item.date, amount: item.amount, label: "Contribution received", method: item.method, reference: item.reference, direction: "in" })), ...partnerPayouts.map((item) => ({ id: item.id, date: item.date, amount: item.amount, label: item.payout_purpose === "profit" ? "Profit payout" : "Capital returned", method: item.method, reference: item.reference, direction: "out" }))].sort((a, b) => b.date.localeCompare(a.date)).map((item) => <div className="project-profit-history-row" key={item.id}><span><strong>{item.label}</strong><small>{formatDate(item.date)} · {item.method || "Method not recorded"}{item.reference ? ` · Ref: ${item.reference}` : ""}</small></span><b className={item.direction === "in" ? "is-in" : ""}>{item.direction === "in" ? "+" : "−"}{formatPKR(item.amount)}</b></div>)}</div> : <p>No money movements recorded for this partner.</p>}</details>
          </article>;
        })}</div></> : <div className="project-profit-no-partners"><Users size={27} /><strong>No partners added</strong><p>Add partners and their ownership shares to see the breakdown.</p></div>}
        <p className="project-profit-note">“Given” is recorded contributions. “Got back” is recorded capital returns and profit payouts. The profit share is an estimate from agreed sales and paid costs, not money already received. Partner payouts appear in Bank and are not project costs.</p>
      </section>
    </>}
    {selected && <PartnerPayoutDialog projectId={projectId} partner={selected} onClose={() => setSelected(null)} onSaved={async () => { setPayouts(await listPartnerPayouts(projectId)); }} />}
  </section>;
}
