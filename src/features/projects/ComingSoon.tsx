import { HardHat, type LucideIcon } from "lucide-react";
export function ComingSoon({
  title,
  icon: Icon = HardHat,
  description = "We're carefully building this part of your workspace. Check back soon.",
}: {
  title: string;
  icon?: LucideIcon;
  description?: string;
}) {
  return (
    <section className="project-coming-soon">
      <div className="project-coming-soon-icon">
        <Icon size={30} aria-hidden="true" />
      </div>
      <span className="project-status">In development</span>
      <h2>{title} is being built</h2>
      <p>{description}</p>
    </section>
  );
}
