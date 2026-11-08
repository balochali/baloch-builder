import { HardHat, Hammer, Ruler, Sparkles } from "lucide-react";
import buildingElevation from "@/assets/building-elevation.svg";
import "./dashboard-welcome.css";

export function DashboardWelcome({ title = "Dashboard" }: { title?: string }) {
  return (
    <section className="dashboard-welcome" aria-labelledby="dashboard-heading">
      <header className="dashboard-welcome-header">
        <div>
          <span className="dashboard-eyebrow">YOUR WORKSPACE, AT A GLANCE</span>
          <h1 id="dashboard-heading">{title}</h1>
        </div>
        <span className="dashboard-status">
          <span /> In development
        </span>
      </header>
      <div className="dashboard-coming-soon">
        <div className="dashboard-blueprint" aria-hidden="true" />
        <div className="dashboard-construction-icon" aria-hidden="true">
          <span className="dashboard-tool dashboard-tool-left">
            <Ruler size={22} />
          </span>
          <HardHat size={64} strokeWidth={1.35} />
          <span className="dashboard-tool dashboard-tool-right">
            <Hammer size={22} />
          </span>
        </div>
        <span className="dashboard-eyebrow dashboard-gold">GOOD THINGS ARE TAKING SHAPE</span>
        <h2>
          Building a clearer view
          <br />
          of your business.
        </h2>
        <p className="dashboard-description">
          Work is in progress on {title.toLowerCase()}. We’re carefully building this part of your
          workspace. Check back soon for updates.
        </p>
        <div className="dashboard-progress-label">
          <Sparkles size={16} aria-hidden="true" /> Thoughtfully built. Coming soon.
        </div>
        <div className="dashboard-skyline" aria-hidden="true">
          <img src={buildingElevation} alt="" />
        </div>
        <div className="dashboard-card-footer">
          <span>BALOCH BUILDERS & DEVELOPERS</span>
          <span>From foundation to skyline</span>
        </div>
      </div>
      <p className="dashboard-footnote">
        A better workspace is taking shape, one detail at a time.
      </p>
    </section>
  );
}
