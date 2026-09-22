import { Clock } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { PageHeader } from "@/components/PageHeader";

interface ComingSoonPageProps {
  module: string;
}

export function ComingSoonPage({ module }: ComingSoonPageProps) {
  return (
    <div>
      <PageHeader title={module} />
      <EmptyState
        icon={<Clock className="size-12" />}
        title={`${module} — Coming Soon`}
        description="This module will be available in a future version of Baloch Builder."
      />
    </div>
  );
}
