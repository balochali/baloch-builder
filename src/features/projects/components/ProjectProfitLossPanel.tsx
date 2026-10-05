import { useEffect, useState } from "react";
import { ArrowDownRight, ArrowUpRight, Calculator, ChartNoAxesCombined, CircleDollarSign, Users, Wallet } from "lucide-react";
import { listProjectSales, type ProjectSale } from "@/data/repositories/projectSalesRepository";
import type { ProjectPartnerRow } from "@/data/repositories/projectPartnersRepository";
import type { Transaction } from "@/domain/types";
import { formatPKR, formatPKRInLakhCrore } from "@/domain/money";
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

export function ProjectProfitLossPanel({ projectId, costs, partners }: { projectId: string; costs: Transaction[]; partners: ProjectPartnerRow[] }) {
  const [sales, setSales] = useState<ProjectSale[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    listProjectSales(projectId)
      .then((rows) => { if (active) setSales(rows); })
      .catch(() => { if (active) setError("Could not load sales. The project result is unavailable right now."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [projectId]);

  const summary = calculateProjectResult(sales, costs, partners);
  const scale = Math.max(summary.saleValue, summary.spent, 1);
  const resultLabel = summary.result > 0 ? "Profit" : summary.result < 0 ? "Loss" : "Break-even";
  const hasRecords = sales.length > 0 || costs.length > 0;
  const status = !hasRecords ? "No result yet" : resultLabel;

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
    </>}
  </section>;
}
