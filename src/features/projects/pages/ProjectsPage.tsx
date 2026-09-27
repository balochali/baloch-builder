import { useEffect, useState } from "react";
import { FolderKanban, Plus, Search, MapPin, ArrowRight, Building2, CalendarDays } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/EmptyState";
import { Input } from "@/components/ui/input";
import { formatDate } from "@/lib/dates";
import type { Project } from "@/domain/types";
import { createProject, listProjects, type CreateProjectInput } from "@/data/repositories/projectsRepository";
import { ProjectDialog } from "@/features/projects/components/ProjectDialog";

export function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [search, setSearch] = useState("");
  const visibleProjects = projects.filter((project) =>
    [project.name, project.code, project.location, project.status]
      .some((field) => field?.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())),
  );
  const stages = ["planning", "land acquired", "under construction", "completed"];
  const activeCount = projects.filter((project) => project.status !== "completed" && project.status !== "on hold").length;
  const completedCount = projects.filter((project) => project.status === "completed").length;
  const onHoldCount = projects.filter((project) => project.status === "on hold").length;

  useEffect(() => {
    let active = true;
    listProjects()
      .then((rows) => { if (active) setProjects(rows); })
      .catch((cause) => { if (active) setError(String(cause)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
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
            <p className="projects-eyebrow">YOUR DEVELOPMENTS</p>
            <h1>Projects</h1>
            <p>See where each development stands and open one to view its full details.</p>
          </div>
          <Button onClick={() => setDialogOpen(true)}><Plus className="size-4" />Add Project</Button>
        </div>
        {!loading && !error && projects.length > 0 && <div className="projects-summary">
          <div><span>All projects</span><strong>{projects.length}</strong><small>Your complete project list</small></div>
          <div><span>In progress</span><strong>{activeCount}</strong><small>Planning, land or construction</small></div>
          <div><span>Completed</span><strong>{completedCount}</strong><small>Finished developments</small></div>
          {onHoldCount > 0 && <div><span>On hold</span><strong>{onHoldCount}</strong><small>Paused for now</small></div>}
        </div>}
      </section>

      <div className="projects-list-heading">
        <div><h2>Your projects</h2><p>Choose a project to see its building, partners and costs.</p></div>
        {!loading && !error && projects.length > 0 && <span>{visibleProjects.length} of {projects.length} shown</span>}
      </div>
      <div className="relative projects-search">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input aria-label="Search projects" placeholder="Search projects by name, code, address or status…"
          className="pl-9" value={search} onChange={(event) => setSearch(event.target.value)} />
      </div>

      {loading && <p className="py-8 text-center text-sm text-muted-foreground">Loading projects…</p>}
      {!loading && error && <p role="alert" className="py-8 text-center text-sm text-destructive">Could not load projects: {error}</p>}
      {!loading && !error && projects.length === 0 &&
        <EmptyState icon={<FolderKanban className="size-12" />} title="No projects yet"
          description="Add your first project to start organizing its records."
          action={<Button onClick={() => setDialogOpen(true)}><Plus className="size-4" />Add Project</Button>} />}
      {!loading && !error && projects.length > 0 && visibleProjects.length === 0 &&
        <p className="py-8 text-center text-sm text-muted-foreground">No projects match your search.</p>}
      {!loading && !error && visibleProjects.length > 0 &&
        <div className="projects-grid">
          {visibleProjects.map((project) =>
            <Link key={project.id} to={`/projects/${project.id}`}
              className="projects-card group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <div className="projects-card-main">
                <div className="projects-card-icon"><Building2 size={25} /></div>
                <div className="projects-card-title"><div><h3>{project.name}</h3>{project.code && <span>Project {project.code}</span>}</div><ArrowRight size={20} /></div>
                {project.location && <p className="projects-card-meta"><MapPin size={17} />{project.location}</p>}
                {project.start_date && <p className="projects-card-meta"><CalendarDays size={17} />Started {formatDate(project.start_date)}</p>}
                {project.description && <p className="projects-card-description">{project.description}</p>}
                <span className="projects-card-action">Open project details <ArrowRight size={16} /></span>
              </div>
              <div className="projects-card-stage">
                <span className="projects-card-stage-label">CURRENT STAGE</span>
                <strong className="capitalize">{project.status || "Planning"}</strong>
                <p>{project.status === "completed" ? "This development is finished." : project.status === "on hold" ? "Work on this project is paused." : "Follow the project from planning through completion."}</p>
                {project.status !== "on hold" && <div className="projects-stage-steps" aria-label={`Project stage: ${project.status || "planning"}`}>
                  {stages.map((stage, index) => {
                    const currentIndex = Math.max(0, stages.indexOf(project.status || "planning"));
                    return <div className={index <= currentIndex ? "is-reached" : ""} key={stage}><span>{index + 1}</span><small>{stage === "land acquired" ? "Land" : stage === "under construction" ? "Building" : stage}</small></div>;
                  })}
                </div>}
              </div>
            </Link>)}
        </div>}

      {dialogOpen && <ProjectDialog open={dialogOpen} onOpenChange={setDialogOpen} onSubmit={handleCreate} />}
    </div>
  );
}
