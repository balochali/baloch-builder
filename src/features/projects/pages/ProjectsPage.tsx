import "./projects.css";
import { useEffect, useState, type CSSProperties } from "react";
import {
  FolderKanban,
  Plus,
  MapPin,
  ArrowRight,
  Building2,
  CalendarDays,
  CircleCheck,
  HardHat,
  Pause,
  MapPinned,
  ClipboardList,
  SlidersHorizontal,
  ChevronDown,
} from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/EmptyState";
import { useRecordFilters } from "@/components/RecordFilters";
import { formatDate } from "@/lib/dates";
import type { Project } from "@/domain/types";
import {
  createProject,
  listProjects,
  type CreateProjectInput,
} from "@/data/repositories/projectsRepository";
import { ProjectDialog } from "@/features/projects/components/ProjectDialog";

const projectStages = [
  {
    status: "planning",
    label: "Planning",
    short: "Planning",
    color: "#7c3aed",
    icon: ClipboardList,
  },
  {
    status: "land acquired",
    label: "Land acquired",
    short: "Land",
    color: "#2563eb",
    icon: MapPinned,
  },
  {
    status: "under construction",
    label: "Under construction",
    short: "Building",
    color: "#d97706",
    icon: HardHat,
  },
  {
    status: "completed",
    label: "Completed",
    short: "Complete",
    color: "#059669",
    icon: CircleCheck,
  },
];
const pausedStage = {
  status: "on hold",
  label: "On hold",
  short: "Paused",
  color: "#e11d48",
  icon: Pause,
};

export function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const {
    visible: visibleProjects,
    controls,
    active: filtersActive,
    reset: resetFilters,
  } = useRecordFilters(projects, {
    label: "projects",
    searchText: (project) =>
      [project.name, project.code, project.location, project.status, project.description]
        .filter(Boolean)
        .join(" "),
    date: (project) => project.start_date,
    dateLabel: "Start date",
    facets: [
      { label: "Project status", value: (project) => project.status },
      { label: "Location", value: (project) => project.location },
    ],
  });
  const activeCount = projects.filter(
    (project) => project.status !== "completed" && project.status !== "on hold",
  ).length;
  const completedCount = projects.filter((project) => project.status === "completed").length;
  const onHoldCount = projects.filter((project) => project.status === "on hold").length;

  useEffect(() => {
    let active = true;
    listProjects()
      .then((rows) => {
        if (active) setProjects(rows);
      })
      .catch((cause) => {
        if (active) setError(String(cause));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  async function handleCreate(values: CreateProjectInput) {
    const project = await createProject(values);
    setProjects((current) => [project, ...current]);
    toast.success("Project created");
  }

  return (
    <div className="projects-page">
      <section className="projects-overview" aria-label="Project overview">
        <div className="projects-overview-heading">
          <div>
            <p className="projects-eyebrow">
              <Building2 size={16} aria-hidden="true" /> YOUR DEVELOPMENTS
            </p>
            <h1>Projects</h1>
            <p>See where each development stands and open one to view its full details.</p>
          </div>
          <Button onClick={() => setDialogOpen(true)}>
            <Plus className="size-4" />
            Add Project
          </Button>
        </div>
        {!loading && !error && projects.length > 0 && (
          <div className="projects-summary">
            {[
              {
                label: "All projects",
                count: projects.length,
                note: "Your complete project list",
                icon: Building2,
                color: "#2563eb",
              },
              {
                label: "In progress",
                count: activeCount,
                note: "Planning, land or construction",
                icon: HardHat,
                color: "#d97706",
              },
              {
                label: "Completed",
                count: completedCount,
                note: "Finished developments",
                icon: CircleCheck,
                color: "#059669",
              },
              {
                label: "On hold",
                count: onHoldCount,
                note: "Paused for now",
                icon: Pause,
                color: "#e11d48",
              },
            ].map(({ label, count, note, icon: Icon, color }) => (
              <div key={label} style={{ "--summary-color": color } as CSSProperties}>
                <span className="projects-summary-icon">
                  <Icon size={25} aria-hidden="true" />
                </span>
                <span>{label}</span>
                <strong>{count}</strong>
                <small>{note}</small>
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="projects-list-heading">
        <div>
          <h2>Your projects</h2>
          <p>Choose a project to see its building, partners and costs.</p>
        </div>
        {!loading && !error && projects.length > 0 && (
          <span>
            {visibleProjects.length} of {projects.length} shown
          </span>
        )}
      </div>
      <details className="projects-search-panel">
        <summary>
          <span>
            <SlidersHorizontal size={18} /> Search & filter projects
          </span>
          <span>
            {filtersActive ? "Filters applied" : "All projects"}
            <ChevronDown size={16} />
          </span>
        </summary>
        {controls}
      </details>
      {filtersActive && (
        <div className="projects-active-filters">
          <span>{visibleProjects.length} projects match your filters.</span>
          <Button variant="ghost" size="sm" onClick={resetFilters}>
            Clear filters
          </Button>
        </div>
      )}

      {loading && (
        <p className="py-8 text-center text-sm text-muted-foreground">Loading projects…</p>
      )}
      {!loading && error && (
        <p role="alert" className="py-8 text-center text-sm text-destructive">
          Could not load projects: {error}
        </p>
      )}
      {!loading && !error && projects.length === 0 && (
        <EmptyState
          icon={<FolderKanban className="size-12" />}
          title="No projects yet"
          description="Add your first project to start organizing its records."
          action={
            <Button onClick={() => setDialogOpen(true)}>
              <Plus className="size-4" />
              Add Project
            </Button>
          }
        />
      )}
      {!loading && !error && projects.length > 0 && visibleProjects.length === 0 && (
        <p className="py-8 text-center text-sm text-muted-foreground">
          No projects match your search.
        </p>
      )}
      {!loading && !error && visibleProjects.length > 0 && (
        <div className="projects-grid">
          {visibleProjects.map((project) => {
            const stage =
              project.status === "on hold"
                ? pausedStage
                : (projectStages.find((item) => item.status === project.status) ??
                  projectStages[0]);
            const StageIcon = stage.icon;
            const currentIndex = Math.max(
              0,
              projectStages.findIndex((item) => item.status === project.status),
            );
            return (
              <Link
                key={project.id}
                to={"/projects/" + project.id}
                className="projects-card"
                style={{ "--project-color": stage.color } as CSSProperties}
              >
                <div className="projects-card-main">
                  <div className="projects-card-top">
                    <span className="projects-card-icon">
                      <Building2 size={29} strokeWidth={1.8} aria-hidden="true" />
                    </span>
                    <span className="projects-stage-badge">
                      <StageIcon size={15} aria-hidden="true" />
                      {stage.label}
                    </span>
                  </div>
                  <div className="projects-card-title">
                    <h3>{project.name}</h3>
                  </div>
                  <span className="projects-card-code">
                    {project.code ? "Project " + project.code : "Development project"}
                  </span>
                  <div className="projects-card-facts">
                    <p className="projects-card-meta">
                      <MapPin size={17} aria-hidden="true" />
                      <span>{project.location || "Location not added"}</span>
                    </p>
                    <p className="projects-card-meta">
                      <CalendarDays size={17} aria-hidden="true" />
                      <span>
                        {project.start_date
                          ? "Started " + formatDate(project.start_date)
                          : "Start date not set"}
                      </span>
                    </p>
                  </div>
                  {project.description && (
                    <p className="projects-card-description">{project.description}</p>
                  )}
                </div>
                <div className="projects-card-stage">
                  <div className="projects-stage-heading">
                    <span>Project journey</span>
                    <strong>
                      {project.status === "on hold"
                        ? "Paused"
                        : "Stage " + (currentIndex + 1) + " of 4"}
                    </strong>
                  </div>
                  {project.status === "on hold" ? (
                    <p className="projects-paused-note">
                      <Pause size={18} aria-hidden="true" />
                      Work is paused. Open the project to review its status.
                    </p>
                  ) : (
                    <ol
                      className="projects-stage-steps"
                      aria-label={"Project stage: " + (project.status || "planning")}
                    >
                      {projectStages.map((item, index) => {
                        const Icon = index < currentIndex ? CircleCheck : item.icon;
                        return (
                          <li
                            key={item.status}
                            className={index <= currentIndex ? "is-reached" : ""}
                            aria-current={index === currentIndex ? "step" : undefined}
                          >
                            <span>
                              <Icon size={16} aria-hidden="true" />
                            </span>
                            <small>{item.short}</small>
                          </li>
                        );
                      })}
                    </ol>
                  )}
                </div>
                <div className="projects-card-footer">
                  <span>Open project details</span>
                  <span>
                    <ArrowRight size={18} aria-hidden="true" />
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {dialogOpen && (
        <ProjectDialog open={dialogOpen} onOpenChange={setDialogOpen} onSubmit={handleCreate} />
      )}
    </div>
  );
}
