import { Wallet } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { PageHeader } from "@/components/PageHeader";

export function LedgerComingSoonPage() {
  return (
    <div>
      <PageHeader
        title="Ledger"
        description="Single money ledger for all cash inflows, payments, and expenses in integer rupees."
      />
      <EmptyState
        icon={<Wallet className="size-10 text-muted-foreground" />}
        title="Money Ledger Coming Soon"
        description="The unified financial ledger will be available in V1 Acquire & Invest."
      />
    </div>
  );
}
