import type { ReactNode } from "react";
import { WorkspaceIllustration, type WorkspaceScene } from "./WorkspaceIllustration";

interface PageHeaderProps {
  title: string;
  description?: string;
  action?: ReactNode;
  scene?: WorkspaceScene;
}

export function PageHeader({ title, description, action, scene }: PageHeaderProps) {
  return (
    <div
      className={`page-header flex items-start justify-between mb-6${scene ? " illustrated-heading" : ""}`}
    >
      {scene && <WorkspaceIllustration scene={scene} />}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="text-sm text-muted-foreground mt-1">{description}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
