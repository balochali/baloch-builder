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
        icon={<MapPin className="size-12" />}
        title="Land — Coming Soon"
        description="We are working on land records and acquisition details."
      />
    </div>
  );
}
