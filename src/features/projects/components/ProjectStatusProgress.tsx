import { CirclePause, ClipboardList, MapPinned, HardHat, CircleCheck } from "lucide-react";

const buildingStages = [
  { id: "planning", label: "Planning", icon: ClipboardList },
  { id: "land acquired", label: "Land acquired", icon: MapPinned },
  { id: "under construction", label: "Construction", icon: HardHat },
  { id: "completed", label: "Completed", icon: CircleCheck },
] as const;

export function ProjectStatusProgress({ status }: { status: string | null }) {
  const stages = status === "land sold"
    ? [buildingStages[0], buildingStages[1], { id: "land sold", label: "Land Sold", icon: CircleCheck }]
    : buildingStages;
  const current = stages.findIndex((stage) => stage.id === status);
  const onHold = status === "on hold";
  const stageIndex = current >= 0 ? current : 0;
  const currentLabel = stages[stageIndex].label;

  return (
    <section className="project-status-progress" aria-label="Project status progress">
      <div className="project-status-heading">
        <div>
          <h2>Project journey</h2>
          <p>
            {onHold
              ? "Work is paused. The stage before the pause was not recorded."
              : `Current stage: ${currentLabel} · Step ${stageIndex + 1} of ${stages.length}`}
          </p>
        </div>
        <strong className={onHold ? "project-status-current is-paused" : "project-status-current"}>
          {onHold && <CirclePause size={17} />}
          {onHold ? "On hold" : currentLabel}
        </strong>
      </div>
      <div
        className={`project-status-steps ${onHold ? "is-paused" : ""}`}
        role="img"
        aria-label={
          onHold
            ? "Project on hold; prior stage is unknown"
            : `Project at ${currentLabel}, stage ${stageIndex + 1} of ${stages.length}`
        }
      >
        {stages.map((stage, index) => (
          <div
            key={stage.id}
            className={`${!onHold && index < stageIndex ? "is-done" : ""} ${!onHold && index === stageIndex ? "is-current" : ""}`}
          >
            <span className="project-status-step-mark">
              <stage.icon size={18} aria-hidden="true" />
            </span>
            <span>{stage.label}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
