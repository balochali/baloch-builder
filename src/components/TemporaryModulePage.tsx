import type { LucideIcon } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { PageHeader } from "@/components/PageHeader";

interface Props {
  title: string;
  description: string;
  icon: LucideIcon;
}

export function TemporaryModulePage({ title, description, icon: Icon }: Props) {
  return <main>
    <PageHeader title={title} description={description} />
    <EmptyState icon={<Icon className="size-12" />}
      title={`${title} — Coming Soon`}
      description={`We are working on this section. ${description}`} />
  </main>;
}
