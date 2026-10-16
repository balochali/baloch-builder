import type { ProjectSale } from "@/data/repositories/projectSalesRepository";
import { BarChart3, Building2, HandCoins, Layers3, Users } from "lucide-react";
import type { Project, ProjectBuildingDetails, ProjectEstimate, Transaction } from "@/domain/types";
import type { ProjectPartnerRow } from "@/data/repositories/projectPartnersRepository";
import type { ProjectLand } from "@/data/repositories/projectStageRepository";
import { formatPKR, formatPKRInLakhCrore } from "@/domain/money";
import { BuildingAreaChart, BuildingMixChart, OwnershipChart, SpendingChart } from "./ProjectInsights";

interface Props {
  project: Project;
  buildingDetails: ProjectBuildingDetails | null;
  land?: ProjectLand | null;
  partners: ProjectPartnerRow[];
  contributions: Transaction[];
  estimates: ProjectEstimate[];
  actualCosts: Transaction[];
  sales?: ProjectSale[] | null;
  salesError?: boolean;
}

function EmptyChart({ title, message }: { title: string; message: string }) {
  return <div className="project-dashboard-empty"><BarChart3 size={25} aria-hidden="true" /><h3>{title}</h3><p>{message}</p></div>;
}

export function ProjectDashboard({ project, buildingDetails, land = null, partners, contributions, estimates, actualCosts, sales = null, salesError = false }: Props) {
  const isLandSold = project.status === "land sold";
  const spaces = buildingDetails ? [buildingDetails.planned_flats, buildingDetails.planned_shops,
    buildingDetails.planned_offices, buildingDetails.planned_houses].reduce<number>((total, count) => total + (count ?? 0), 0) : 0;
  const received = contributions.reduce((total, payment) => total + payment.amount, 0);
  const spent = actualCosts.reduce((total, cost) => total + cost.amount, 0);
  const estimatedCosts = estimates.filter((item) => item.kind === "cost");
  const expectedRecovery = estimates.filter((item) => item.kind === "revenue");
  const costMin = estimatedCosts.reduce((total, item) => total + item.minimum_amount, 0);
  const costMax = estimatedCosts.reduce((total, item) => total + item.maximum_amount, 0);
  const recoveryMin = expectedRecovery.reduce((total, item) => total + item.minimum_amount, 0);
  const recoveryMax = expectedRecovery.reduce((total, item) => total + item.maximum_amount, 0);
  const construction = actualCosts.filter(cost => cost.type === "construction_cost");
  const constructionPaid = construction.reduce((total, cost) => total + cost.amount, 0);
  const thekedarPaid = construction.reduce((total, cost) => {
    try { return total + (JSON.parse(cost.custom || "{}").contractor_id ? cost.amount : 0); }
    catch { return total; }
  }, 0);
  const saleTotal = sales?.reduce((total, sale) => total + sale.price, 0) ?? 0;
  const saleValue = (amount: number) => sales === null ? (salesError ? "Unavailable" : "Loading…") : formatPKRInLakhCrore(amount);
  const landPaid = actualCosts.filter(cost => cost.type === "land_purchase").reduce((total, cost) => total + cost.amount, 0);
  const comparisonMax = Math.max(costMax, recoveryMax, spent, 1);

  return <section id="project-panel-dashboard" role="tabpanel" aria-labelledby="project-tab-dashboard" className="project-dashboard">
    <div className="project-dashboard-heading"><div><p className="projects-eyebrow">PROJECT AT A GLANCE</p><h2>{project.name} dashboard</h2><p>{isLandSold ? "Land sold. Review the land and money records saved for this project." : "Charts below use the building plan and money records saved for this project."}</p></div><span className="project-dashboard-stage">{project.status || "Planning"}</span></div>
    <div className="project-dashboard-metrics">
      {!isLandSold && <div><span className="project-dashboard-metric-icon"><Layers3 size={20} /></span><small>Planned spaces</small><strong>{buildingDetails ? spaces.toLocaleString() : "Not added"}</strong><p>Flats, shops, offices and houses</p></div>}
      <div><span className="project-dashboard-metric-icon"><Users size={20} /></span><small>Partners</small><strong>{partners.length}</strong><p>People linked to this project</p></div>
      <div><span className="project-dashboard-metric-icon"><HandCoins size={20} /></span><small>Received from partners</small><strong>{formatPKRInLakhCrore(received)}</strong><p>Payments from partners</p></div>
      <div><span className="project-dashboard-metric-icon"><Building2 size={20} /></span><small>Project costs</small><strong>{formatPKRInLakhCrore(spent)}</strong><p>Land purchase and project spending so far</p></div>
    </div>
    <section className="dashboard-money-section spending-section" aria-labelledby="spending-title">
      <header><span className="dashboard-section-number">01</span><div><h2 id="spending-title">Money spent so far</h2><p>Payments already recorded for this project.</p></div><span className="dashboard-section-tag">Recorded costs</span></header>
      <div className="dashboard-money-layout">
        <div className="dashboard-money-total"><small>Total project spending</small><strong>{formatPKRInLakhCrore(spent)}</strong><p>Land + construction + other costs</p></div>
        <dl className="dashboard-money-breakdown">
          <div><dt>Land purchase</dt><dd>{formatPKRInLakhCrore(landPaid)}</dd></div>
          <div><dt>Construction paid</dt><dd>{formatPKRInLakhCrore(constructionPaid)}</dd></div>
          <div className="dashboard-subtotal"><dt>Of this, paid to thekedar</dt><dd>{formatPKRInLakhCrore(thekedarPaid)}</dd></div>
          <div><dt>Other project costs</dt><dd>{formatPKRInLakhCrore(spent - landPaid - constructionPaid)}</dd></div>
        </dl>
      </div>
      <p className="dashboard-section-note">Thekedar payments are included in construction above, counted only once.</p>
    </section>
    <section className="dashboard-money-section sales-section" aria-labelledby="sales-title">
      <header><span className="dashboard-section-number">02</span><div><h2 id="sales-title">Sales made so far</h2><p>The prices buyers agreed to pay for sold units.</p></div><span className="dashboard-section-tag">Agreed sale prices</span></header>
      <div className="dashboard-money-layout">
        <div className="dashboard-money-total"><small>Total sales value</small><strong>{saleValue(saleTotal)}</strong><p>This is not the amount collected from buyers.</p></div>
        <dl className="dashboard-money-breakdown">
          {(["flat", "shop", ...(isLandSold ? ["land"] : [])] as const).map(kind => <div key={kind}><dt>{kind === "flat" ? "Flat sales agreed" : kind === "shop" ? "Shop sales agreed" : "Land sales agreed"}<small>{sales === null ? "" : `${sales.filter(sale => sale.kind === kind).length} sold`}</small></dt><dd>{saleValue(sales?.filter(sale => sale.kind === kind).reduce((total, sale) => total + sale.price, 0) ?? 0)}</dd></div>)}
        </dl>
      </div>
      <div className="dashboard-current-result"><div><h3>Sales compared with spending</h3><p>{sales === null ? "Waiting for sales records." : saleTotal < spent ? "Spending is higher than sales agreed so far. More sales may still be made." : "Sales agreed are higher than spending so far. More costs may still be added."}</p></div><strong>{saleValue(Math.abs(saleTotal - spent))}<small>{sales === null ? "" : saleTotal < spent ? "more spent than sold" : "sales above spending"}</small></strong></div>
      <p className="dashboard-section-note">This comparison is not final profit. It uses agreed sale prices and costs recorded to date.</p>
    </section>
    <section className="dashboard-money-section forecast-section" aria-labelledby="forecast-title">
      <header><span className="dashboard-section-number">03</span><div><h2 id="forecast-title">What we expect when the project is finished</h2><p>Your planned sales and costs from the Estimate tab.</p></div><span className="dashboard-section-tag">Future estimates</span></header>
      <div className="dashboard-forecast-grid">
        {[{title:"Expected total sales", low:recoveryMin, high:recoveryMax, ready:expectedRecovery.length > 0, note:"Value of all sales you plan to make."},
          {title:"Expected total costs", low:costMin, high:costMax, ready:estimatedCosts.length > 0, note:"Budget for land, construction, thekedar and other costs."},
          {title:"Expected profit / loss", low:recoveryMin-costMax, high:recoveryMax-costMin, ready:estimatedCosts.length > 0 && expectedRecovery.length > 0, note:"Expected sales minus expected costs. A negative amount means a loss."}].map(item => <div className="dashboard-forecast-card" key={item.title}><h3>{item.title}</h3>{item.ready ? <dl><div><dt>Low estimate</dt><dd>{formatPKRInLakhCrore(item.low)}</dd></div><div><dt>High estimate</dt><dd>{formatPKRInLakhCrore(item.high)}</dd></div></dl> : <p>Add this in the Estimate tab</p>}<p>{item.note}</p></div>)}
      </div>
      {estimatedCosts.length > 0 && costMax < spent && <p className="dashboard-budget-notice">Your recorded spending is already above your highest cost estimate. Update the Estimate tab before relying on the expected profit.</p>}
      <p className="dashboard-section-note">Include the full thekedar agreement in your cost estimate. These plans do not update automatically when you record a payment.</p>
    </section>
    <div className="dashboard-charts-title"><h2>Project charts</h2><p>Explore the building plan, partner shares and spending below.</p></div>
    <div className="project-dashboard-charts">
      {land && <div className="project-dashboard-chart"><BuildingAreaChart details={isLandSold ? null : buildingDetails} land={land} /></div>}
      {!isLandSold && <div className="project-dashboard-chart">{buildingDetails && spaces > 0 ? <BuildingMixChart details={buildingDetails} /> :
        <EmptyChart title="Building mix" message="Add planned flats, shops, offices or houses in Building to see the circular chart." />}</div>}
      <div className="project-dashboard-chart">{partners.length > 0 ? <OwnershipChart partners={partners} /> :
        <EmptyChart title="Partner shares" message="Add project partners to see how ownership is divided." />}</div>
      <div className="project-dashboard-chart">{estimatedCosts.length > 0 || expectedRecovery.length > 0 || actualCosts.length > 0 ?
        <div className="project-dashboard-bars"><h3>Project money picture</h3><p>Compare expected costs, money planned from sales, and spending so far.</p>
          {[{ label: "Lowest estimated cost", amount: costMin, color: "#e5aa32" },
            { label: "Highest estimated cost", amount: costMax, color: "#317eaf" },
            { label: "Lowest expected recovery", amount: recoveryMin, color: "#8d73bc" },
            { label: "Highest expected recovery", amount: recoveryMax, color: "#b599d5" },
            { label: "Actual cost so far", amount: spent, color: "#42a98e" }].filter((item) =>
              item.label === "Actual cost so far" ? actualCosts.length > 0 :
                item.label.includes("recovery") ? expectedRecovery.length > 0 : estimatedCosts.length > 0)
            .map((item) => <div className="project-dashboard-bar" key={item.label}><div><strong>{item.label}</strong><span>{formatPKRInLakhCrore(item.amount)}</span></div>
              <span className="project-dashboard-bar-track" role="img" aria-label={`${item.label}: ${formatPKR(item.amount)}`}><span style={{ width: `${item.amount / comparisonMax * 100}%`, background: item.color }} /></span></div>)}
          <small>These bars compare amounts in rupees; actual costs grow as payments are recorded.</small>
        </div> : <EmptyChart title="Money comparison" message="Add expected costs, expected recovery or actual costs to compare the plan with spending." />}</div>
      <div className="project-dashboard-chart">{actualCosts.length > 0 ? <SpendingChart costs={actualCosts} /> :
        <EmptyChart title="Spending over time" message="Record actual project costs to see a line chart of spending over time." />}</div>
    </div>
  </section>;
}
