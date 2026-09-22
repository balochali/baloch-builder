import { FolderKanban } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { PageHeader } from "@/components/PageHeader";

export function ProjectsComingSoonPage() {
  return (
    <div>
      <PageHeader
        title="Projects"
        description="Organize developments, milestones, and project timelines."
      />
      <EmptyState
        icon={<FolderKanban className="size-10 text-muted-foreground" />}
        title="Projects Module Coming Soon"
        description="Project management and development tracking will be available in V1 Acquire & Invest."
      />
    </div>
  );
}
