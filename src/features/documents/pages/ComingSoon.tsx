import { FileText } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { PageHeader } from "@/components/PageHeader";

export function DocumentsComingSoonPage() {
  return (
    <div>
      <PageHeader
        title="Documents"
        description="Local attachment management for land fards, maps, receipts, and agreements."
      />
      <EmptyState
        icon={<FileText className="size-10 text-muted-foreground" />}
        title="Documents Module Coming Soon"
        description="Document attachments and file viewer will be available in V1 Acquire & Invest."
      />
    </div>
  );
}
