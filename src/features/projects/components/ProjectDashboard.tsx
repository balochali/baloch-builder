import { BarChart3, Building2, HandCoins, Layers3, Users } from "lucide-react";
import type { Project, ProjectBuildingDetails, ProjectEstimate, Transaction } from "@/domain/types";
import type { ProjectPartnerRow } from "@/data/repositories/projectPartnersRepository";
import { formatPKR, formatPKRInLakhCrore } from "@/domain/money";
import { BuildingMixChart, OwnershipChart, SpendingChart } from "./ProjectInsights";

interface Props {
  project: Project;
  buildingDetails: ProjectBuildingDetails | null;
  partners: ProjectPartnerRow[];
  contributions: Transaction[];
  estimates: ProjectEstimate[];
  actualCosts: Transaction[];
}

function EmptyChart({ title, message }: { title: string; message: string }) {
  return <div className="project-dashboard-empty"><BarChart3 size={25} aria-hidden="true" /><h3>{title}</h3><p>{message}</p></div>;
}

export function ProjectDashboard({ project, buildingDetails, partners, contributions, estimates, actualCosts }: Props) {
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
  const comparisonMax = Math.max(costMax, recoveryMax, spent, 1);

  return <section id="project-panel-dashboard" role="tabpanel" aria-labelledby="project-tab-dashboard" className="project-dashboard">
    <div className="project-dashboard-heading"><div><p className="projects-eyebrow">PROJECT AT A GLANCE</p><h2>{project.name} dashboard</h2><p>Charts below use the building plan and money records saved for this project.</p></div><span className="project-dashboard-stage">{project.status || "Planning"}</span></div>
    <div className="project-dashboard-metrics">
      <div><span className="project-dashboard-metric-icon"><Layers3 size={20} /></span><small>Planned spaces</small><strong>{buildingDetails ? spaces.toLocaleString() : "Not added"}</strong><p>Flats, shops, offices and houses</p></div>
      <div><span className="project-dashboard-metric-icon"><Users size={20} /></span><small>Partners</small><strong>{partners.length}</strong><p>People linked to this project</p></div>
      <div><span className="project-dashboard-metric-icon"><HandCoins size={20} /></span><small>Money received</small><strong>{formatPKRInLakhCrore(received)}</strong><p>Payments from partners</p></div>
      <div><span className="project-dashboard-metric-icon"><Building2 size={20} /></span><small>Actual cost</small><strong>{formatPKRInLakhCrore(spent)}</strong><p>Project costs recorded so far</p></div>
    </div>
    <div className="project-dashboard-charts">
      <div className="project-dashboard-chart">{buildingDetails && spaces > 0 ? <BuildingMixChart details={buildingDetails} /> :
        <EmptyChart title="Building mix" message="Add planned flats, shops, offices or houses in Building to see the circular chart." />}</div>
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
