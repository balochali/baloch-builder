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
        icon={<Wallet className="size-12" />}
        title="Ledger — Coming Soon"
        description="We are working on a single view of money received and spent."
      />
    </div>
  );
}
