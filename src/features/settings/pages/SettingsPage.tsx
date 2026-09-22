import { Settings } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { PageHeader } from "@/components/PageHeader";

export function SettingsPage() {
  return (
    <div>
      <PageHeader title="Settings" description="Application settings and preferences." />
      <EmptyState
        icon={<Settings className="size-12" />}
        title="Settings — Coming Soon"
        description="Theme, backup, and custom field configuration will be available here."
      />
    </div>
  );
}
