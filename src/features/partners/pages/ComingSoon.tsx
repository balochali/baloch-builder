import { Users } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { PageHeader } from "@/components/PageHeader";

export function PartnersComingSoonPage() {
  return (
    <div>
      <PageHeader
        title="Partners"
        description="Manage investment partners, ownership shares in basis points, and contributions."
      />
      <EmptyState
        icon={<Users className="size-10 text-muted-foreground" />}
        title="Partners Module Coming Soon"
        description="Partnership tracking and investor positions will be available in V1 Acquire & Invest."
      />
    </div>
  );
}
