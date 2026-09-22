import { useEffect, useState } from "react";
import { FolderKanban, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/EmptyState";
import { PageHeader } from "@/components/PageHeader";
import { formatDate } from "@/lib/dates";
import type { Project } from "@/domain/types";
import { createProject, listProjects, type CreateProjectInput } from "@/data/repositories/projectsRepository";
import { ProjectDialog } from "@/features/projects/components/ProjectDialog";

export function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);

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

      {loading && <p className="py-8 text-center text-sm text-muted-foreground">Loading projects…</p>}
      {!loading && error && <p role="alert" className="py-8 text-center text-sm text-destructive">Could not load projects: {error}</p>}
      {!loading && !error && projects.length === 0 &&
        <EmptyState icon={<FolderKanban className="size-12" />} title="No projects yet"
          description="Add your first project to start organizing its records."
          action={<Button onClick={() => setDialogOpen(true)}><Plus className="size-4" />Add Project</Button>} />}
      {!loading && !error && projects.length > 0 &&
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Project</th>
                <th className="px-4 py-3 font-medium">Address</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Start date</th>
              </tr>
            </thead>
            <tbody>
              {projects.map((project) => <tr key={project.id} className="border-t">
                <td className="px-4 py-3">
                  <div className="font-medium">{project.name}</div>
                  {project.code && <div className="text-xs text-muted-foreground">{project.code}</div>}
                </td>
                <td className="px-4 py-3">{project.location}</td>
                <td className="px-4 py-3 capitalize">{project.status ?? "Planning"}</td>
                <td className="px-4 py-3">{formatDate(project.start_date)}</td>
              </tr>)}
            </tbody>
          </table>
        </div>}

      {dialogOpen && <ProjectDialog open={dialogOpen} onOpenChange={setDialogOpen} onSubmit={handleCreate} />}
    </div>
  );
}
