import { CirclePause } from "lucide-react";

const stages = [
  { id: "planning", label: "Planning" },
  { id: "land acquired", label: "Land acquired" },
  { id: "under construction", label: "Construction" },
  { id: "completed", label: "Completed" },
] as const;

export function ProjectStatusProgress({ status }: { status: string | null }) {
  const current = stages.findIndex((stage) => stage.id === status);
  const onHold = status === "on hold";
  const stageIndex = current >= 0 ? current : 0;
  const currentLabel = stages[stageIndex].label;

  return <section className="project-status-progress" aria-label="Project status progress">
    <div className="project-status-heading"><div><h2>Project journey</h2><p>{onHold ? "Work is paused. The stage before the pause was not recorded." :
      `Current stage: ${currentLabel} · Step ${stageIndex + 1} of ${stages.length}`}</p></div>
      <strong className={onHold ? "project-status-current is-paused" : "project-status-current"}>{onHold && <CirclePause size={17} />}{onHold ? "On hold" : currentLabel}</strong>
    </div>
    <div className={`project-status-steps ${onHold ? "is-paused" : ""}`} role="img" aria-label={onHold ? "Project on hold; prior stage is unknown" : `Project at ${currentLabel}, stage ${stageIndex + 1} of ${stages.length}`}>
      {stages.map((stage, index) => <div key={stage.id} className={`${!onHold && index < stageIndex ? "is-done" : ""} ${!onHold && index === stageIndex ? "is-current" : ""}`}>
        <span className="project-status-step-mark">{index + 1}</span><span>{stage.label}</span>
      </div>)}
    </div>
  </section>;
}
