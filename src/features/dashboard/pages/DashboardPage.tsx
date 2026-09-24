import { LayoutDashboard } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { PageHeader } from "@/components/PageHeader";

export function DashboardPage() {
  return <main>
    <PageHeader title="Dashboard" description="Your business overview and recent activity." />
    <EmptyState icon={<LayoutDashboard className="size-12" />}
      title="Dashboard — Coming Soon"
      description="We are working on an overview of your projects and business activity. You can continue using the other sections." />
  </main>;
}
