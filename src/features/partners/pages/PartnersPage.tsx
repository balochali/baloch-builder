import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, Plus, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/EmptyState";
import { PageHeader } from "@/components/PageHeader";
import { useRecordFilters } from "@/components/RecordFilters";
import {
  addPartnerContribution,
  listAllPartnerContributions,
  listAllProjectPartners,
  type PartnerContributionInput,
  type PartnerOverviewRow,
} from "@/data/repositories/projectPartnersRepository";
import type { Transaction } from "@/domain/types";
import { formatPKR } from "@/domain/money";
import { formatDate } from "@/lib/dates";
import { ProjectPartnerDialog } from "@/features/projects/components/ProjectPartnerDialog";
import { PaymentDetailsView } from "@/features/partners/components/PaymentDetailsView";

export function PartnersPage() {
  const [partners, setPartners] = useState<PartnerOverviewRow[]>([]);
  const [contributions, setContributions] = useState<Transaction[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedPartner, setSelectedPartner] = useState<PartnerOverviewRow | null>(null);

  useEffect(() => {
    let active = true;
    Promise.all([listAllProjectPartners(), listAllPartnerContributions()])
      .then(([partnerRows, paymentRows]) => {
        if (!active) return;
        setPartners(partnerRows);
        setContributions(paymentRows);
      })
      .catch((cause) => {
        if (active) setError(String(cause));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const { visible, controls } = useRecordFilters(partners, {
    label: "partners",
    searchText: (partner) =>
      [
        partner.name,
        partner.phone,
        partner.phone2,
        partner.project_name,
        partner.project_code,
        partner.project_location,
        partner.notes,
      ]
        .filter(Boolean)
        .join(" "),
    date: (partner) => partner.created_at,
    dateLabel: "Joined",
    amount: (partner) => partner.contributed,
    facets: [
      { label: "Project", value: (partner) => partner.project_name },
      {
        label: "Funding status",
        value: (partner) =>
          partner.agreed_contribution === null
            ? "No target set"
            : partner.contributed >= partner.agreed_contribution
              ? "Fully funded"
              : "Balance remaining",
      },
    ],
  });

  const matchingPayments = contributions.filter((item) =>
    visible.some(
      (partner) => partner.project_id === item.project_id && partner.partner_id === item.partner_id,
    ),
  );
  const paymentFilter = useRecordFilters(matchingPayments, {
    label: "contributions",
    searchText: (item) =>
      [
        partners.find((partner) => partner.partner_id === item.partner_id)?.name,
        item.description,
        item.reference,
      ]
        .filter(Boolean)
        .join(" "),
    date: (item) => item.date,
    amount: (item) => item.amount,
    facets: [{ label: "Payment method", value: (item) => item.method }],
  });

  async function recordContribution(value: PartnerContributionInput) {
    await addPartnerContribution(value);
    toast.success("Partner contribution recorded");
    try {
      const [partnerRows, paymentRows] = await Promise.all([
        listAllProjectPartners(),
        listAllPartnerContributions(),
      ]);
      setPartners(partnerRows);
      setContributions(paymentRows);
    } catch {
      toast.error("Payment saved. Refresh the page to see the latest details.");
    }
  }

  const totalReceived = contributions.reduce((total, item) => total + item.amount, 0);

  return (
    <div>
      <PageHeader
        title="Partners"
        description="Project shares, contact information and contribution history."
      />
      {loading && <p className="py-8 text-sm text-muted-foreground">Loading partners…</p>}
      {!loading && error && (
        <p role="alert" className="py-8 text-sm text-destructive">
          Could not load partners: {error}
        </p>
      )}
      {!loading && !error && (
        <>
          <div className="mb-6 grid gap-3 sm:grid-cols-3">
            <Summary
              label="Partners"
              value={String(new Set(partners.map((partner) => partner.partner_id)).size)}
            />
            <Summary label="Project partnerships" value={String(partners.length)} />
            <Summary label="Total received" value={formatPKR(totalReceived)} />
          </div>
          {controls}
          <p className="scope-note">
            Summary above includes all partnerships. Profile filters also select whose contributions
            appear in the history below.
          </p>
          {partners.length === 0 ? (
            <EmptyState
              icon={<Users className="size-10 text-muted-foreground" />}
              title="No partners yet"
              description="Open a project and use Add Partner to register its investors."
            />
          ) : visible.length === 0 ? (
            <p className="rounded-lg border p-8 text-center text-sm text-muted-foreground">
              No partners match your search.
            </p>
          ) : (
            <div className="grid gap-4 xl:grid-cols-2">
              {visible.map((partner) => {
                const payments = contributions.filter(
                  (item) =>
                    item.project_id === partner.project_id &&
                    item.partner_id === partner.partner_id,
                );
                return (
                  <section key={partner.partnership_id} className="rounded-xl border bg-card p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h2 className="text-lg font-semibold">{partner.name}</h2>
                        <p className="text-sm text-muted-foreground">
                          {partner.phone || "No mobile number"}
                          {partner.phone2 ? ` · ${partner.phone2}` : ""}
                        </p>
                      </div>
                      <span className="rounded-full bg-muted px-3 py-1 text-sm font-medium">
                        {(partner.share_bp / 100).toFixed(2)}% share
                      </span>
                    </div>
                    <div className="mt-4 rounded-lg border bg-muted/20 p-3">
                      <p className="text-xs text-muted-foreground">Project</p>
                      <Link
                        to={`/projects/${partner.project_id}`}
                        className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
                      >
                        {partner.project_name}
                        {partner.project_code ? ` · ${partner.project_code}` : ""}
                        <ArrowUpRight className="size-4" />
                      </Link>
                      <p className="text-xs text-muted-foreground">
                        {partner.project_location || "No project address"}
                        {partner.project_status ? ` · ${partner.project_status}` : ""}
                      </p>
                    </div>
                    <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                      <Fact label="Address" value={partner.address} />
                      <Fact
                        label="Partner status"
                        value={partner.partner_status || partner.partnership_status}
                      />
                      <Fact label="Partner since" value={formatDate(partner.created_at)} />
                      <Fact
                        label="Agreed contribution"
                        value={
                          partner.agreed_contribution === null
                            ? null
                            : formatPKR(partner.agreed_contribution)
                        }
                      />
                      <Fact label="Received" value={formatPKR(partner.contributed)} />
                    </div>
                    {partner.notes && (
                      <div className="mt-3 text-sm">
                        <Fact label="Notes" value={partner.notes} />
                      </div>
                    )}
                    <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t pt-4">
                      <p className="text-sm font-medium">Payments ({payments.length})</p>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setSelectedPartner(partner)}
                      >
                        <Plus className="size-4" />
                        Record Contribution
                      </Button>
                    </div>
                    {payments.length === 0 && (
                      <p className="mt-3 text-sm text-muted-foreground">
                        No contributions recorded yet.
                      </p>
                    )}
                  </section>
                );
              })}
            </div>
          )}
          <section className="settings-section mt-6" aria-label="Contribution history">
            <h2>Contribution history</h2>
            <p>Payments from the partner profiles matching your filters above.</p>
            {paymentFilter.controls}
            {paymentFilter.visible.length === 0 ? (
              <p className="filter-empty">No contributions match these filters.</p>
            ) : (
              <div className="space-y-3">
                {paymentFilter.visible.map((payment) => {
                  const partner = partners.find(
                    (item) =>
                      item.partner_id === payment.partner_id &&
                      item.project_id === payment.project_id,
                  );
                  return (
                    <article key={payment.id} className="rounded-lg border p-4">
                      <div className="flex flex-wrap justify-between gap-3">
                        <div>
                          <strong>{partner?.name || "Partner"}</strong>
                          <span className="text-sm text-muted-foreground">
                            {" "}
                            · {partner?.project_name || "Project"}
                          </span>
                          <p>
                            {formatDate(payment.date)} · {payment.method || "Other"}
                          </p>
                        </div>
                        <strong>{formatPKR(payment.amount)}</strong>
                      </div>
                      <p>
                        {payment.description || "Contribution"}
                        {payment.reference ? ` · Ref: ${payment.reference}` : ""}
                      </p>
                      <PaymentDetailsView transaction={payment} />
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        </>
      )}
      {selectedPartner && (
        <ProjectPartnerDialog
          projectId={selectedPartner.project_id}
          partner={selectedPartner}
          onOpenChange={(open) => {
            if (!open) setSelectedPartner(null);
          }}
          onContribution={recordContribution}
        />
      )}
    </div>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-2 text-lg font-semibold">{value}</p>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 font-medium">{value || "—"}</p>
    </div>
  );
}
