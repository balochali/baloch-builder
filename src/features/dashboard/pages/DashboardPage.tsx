import { ArrowRight, Building2, Construction } from "lucide-react";
import { Link } from "react-router-dom";

export function DashboardPage() {
  return <main className="dashboard-page dashboard-temporary">
    <section className="dashboard-temporary-card" aria-labelledby="dashboard-temporary-title">
      <div className="dashboard-temporary-mark"><Construction size={34} aria-hidden="true" /></div>
      <p className="dashboard-eyebrow">DASHBOARD UPDATE IN PROGRESS</p>
      <h1 id="dashboard-temporary-title">We’re still working on this dashboard</h1>
      <p>This is a temporary page while we improve the overview of your business. Your project details are available in Projects.</p>
      <Link to="/projects" className="dashboard-hero-action">View projects <ArrowRight size={18} aria-hidden="true" /></Link>
      <div className="dashboard-temporary-foot"><Building2 size={18} aria-hidden="true" /><span>Continue managing your building plans, partners, estimates and costs from each project.</span></div>
    </section>
  </main>;
}
