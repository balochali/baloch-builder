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
        icon={<FileText className="size-12" />}
        title="Documents — Coming Soon"
        description="We are working on document attachments and a file viewer."
      />
    </div>
  );
}
