import { useEffect, useState } from "react";
import { FolderKanban, Plus, Search, MapPin, ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/EmptyState";
import { PageHeader } from "@/components/PageHeader";
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
    <div>
      <PageHeader title="Projects" description="Create and organize your development projects."
        action={<Button onClick={() => setDialogOpen(true)}><Plus className="size-4" />Add Project</Button>} />

      <div className="relative mb-6 max-w-md">
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
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {visibleProjects.map((project) =>
            <Link key={project.id} to={`/projects/${project.id}`}
              className="group rounded-xl border bg-card p-5 transition-colors hover:border-primary/60 hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold group-hover:text-primary">{project.name}</h2>
                  {project.code && <p className="text-xs text-muted-foreground">Code: {project.code}</p>}
                </div>
                <ArrowRight className="size-4 shrink-0 text-muted-foreground group-hover:text-foreground" />
              </div>
              <p className="mt-4 flex items-start gap-2 text-sm text-muted-foreground">
                <MapPin className="mt-0.5 size-4 shrink-0" />{project.location || "No address"}
              </p>
              <div className="mt-5 flex items-center justify-between border-t pt-4 text-xs">
                <span className="rounded-full bg-muted px-2.5 py-1 capitalize">{project.status ?? "Planning"}</span>
                <span className="text-muted-foreground">{formatDate(project.start_date)}</span>
              </div>
            </Link>)}
        </div>}

      {dialogOpen && <ProjectDialog open={dialogOpen} onOpenChange={setDialogOpen} onSubmit={handleCreate} />}
    </div>
  );
}
