import { ArrowRight, Construction, type LucideIcon } from "lucide-react";
import { Link } from "react-router-dom";

interface Props {
  title: string;
  description: string;
  icon: LucideIcon;
}

export function TemporaryModulePage({ title, description, icon: Icon }: Props) {
  return <main className="dashboard-page dashboard-temporary">
    <section className="dashboard-temporary-card" aria-labelledby="module-temporary-title">
      <div className="dashboard-temporary-mark"><Icon size={34} aria-hidden="true" /></div>
      <p className="dashboard-eyebrow"><Construction size={15} aria-hidden="true" /> WORK IN PROGRESS</p>
      <h1 id="module-temporary-title">{title} is coming soon</h1>
      <p>{description} Work on this section is still going on. For now, you can continue using the available parts of the app.</p>
      <Link to="/projects" className="dashboard-hero-action">Go to Projects <ArrowRight size={18} aria-hidden="true" /></Link>
    </section>
  </main>;
}
