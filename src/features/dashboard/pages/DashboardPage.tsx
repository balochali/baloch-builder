import { LayoutDashboard } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { PageHeader } from "@/components/PageHeader";

export function DashboardPage() {
  return (
    <div>
      <PageHeader
        title="Dashboard"
        description="Overview of your projects, land, and financials."
      />
      <EmptyState
        icon={<LayoutDashboard className="size-12" />}
        title="Dashboard — Coming in V3"
        description="Charts and summaries will appear here once more modules are built."
      />
    </div>
  );
}
