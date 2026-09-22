import { MapPin } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { PageHeader } from "@/components/PageHeader";

export function LandComingSoonPage() {
  return (
    <div>
      <PageHeader
        title="Land"
        description="Track land acquisition, seller details, purchase amounts, and personal vs project holdings."
      />
      <EmptyState
        icon={<MapPin className="size-10 text-muted-foreground" />}
        title="Land Module Coming Soon"
        description="The land tracking and acquisition module will be available in V1 Acquire & Invest."
      />
    </div>
  );
}
