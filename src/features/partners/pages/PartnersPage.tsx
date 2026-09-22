import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, Plus, Search, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/EmptyState";
import { PageHeader } from "@/components/PageHeader";
import { Input } from "@/components/ui/input";
import { addPartnerContribution, listAllPartnerContributions, listAllProjectPartners,
  type PartnerContributionInput, type PartnerOverviewRow } from "@/data/repositories/projectPartnersRepository";
import type { Transaction } from "@/domain/types";
import { formatPKR } from "@/domain/money";
import { formatDate } from "@/lib/dates";
import { ProjectPartnerDialog } from "@/features/projects/components/ProjectPartnerDialog";
import { PaymentDetailsView } from "@/features/partners/components/PaymentDetailsView";

export function PartnersPage() {
  const [partners, setPartners] = useState<PartnerOverviewRow[]>([]);
  const [contributions, setContributions] = useState<Transaction[]>([]);
  const [search, setSearch] = useState("");
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
      .catch((cause) => { if (active) setError(String(cause)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const visible = useMemo(() => {
    const term = search.trim().toLocaleLowerCase();
    return term ? partners.filter((partner) => [partner.name, partner.phone, partner.phone2,
      partner.project_name, partner.project_code, partner.project_location]
      .some((value) => value?.toLocaleLowerCase().includes(term))) : partners;
  }, [partners, search]);

  async function recordContribution(value: PartnerContributionInput) {
    await addPartnerContribution(value);
    toast.success("Partner contribution recorded");
    try {
      const [partnerRows, paymentRows] = await Promise.all([listAllProjectPartners(), listAllPartnerContributions()]);
      setPartners(partnerRows);
      setContributions(paymentRows);
    } catch {
      toast.error("Payment saved. Refresh the page to see the latest details.");
    }
  }

  const totalReceived = contributions.reduce((total, item) => total + item.amount, 0);

  return <div>
    <PageHeader title="Partners" description="Project shares, contact information and contribution history." />
    {loading && <p className="py-8 text-sm text-muted-foreground">Loading partners…</p>}
    {!loading && error && <p role="alert" className="py-8 text-sm text-destructive">Could not load partners: {error}</p>}
    {!loading && !error && <>
      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <Summary label="Partners" value={String(new Set(partners.map((partner) => partner.partner_id)).size)} />
        <Summary label="Project partnerships" value={String(partners.length)} />
        <Summary label="Total received" value={formatPKR(totalReceived)} />
      </div>
      <div className="relative mb-6 max-w-xl">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input aria-label="Search partners" placeholder="Search partner, mobile number or project…"
          className="pl-9" value={search} onChange={(event) => setSearch(event.target.value)} />
      </div>
      {partners.length === 0 ? <EmptyState icon={<Users className="size-10 text-muted-foreground" />}
        title="No partners yet" description="Open a project and use Add Partner to register its investors." /> :
        visible.length === 0 ? <p className="rounded-lg border p-8 text-center text-sm text-muted-foreground">No partners match your search.</p> :
        <div className="grid gap-4 xl:grid-cols-2">{visible.map((partner) => {
          const payments = contributions.filter((item) => item.project_id === partner.project_id &&
            item.partner_id === partner.partner_id);
          return <section key={partner.partnership_id} className="rounded-xl border bg-card p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div><h2 className="text-lg font-semibold">{partner.name}</h2>
                <p className="text-sm text-muted-foreground">{partner.phone || "No mobile number"}
                  {partner.phone2 ? ` · ${partner.phone2}` : ""}</p></div>
              <span className="rounded-full bg-muted px-3 py-1 text-sm font-medium">{(partner.share_bp / 100).toFixed(2)}% share</span>
            </div>
            <div className="mt-4 rounded-lg border bg-muted/20 p-3">
              <p className="text-xs text-muted-foreground">Project</p>
              <Link to={`/projects/${partner.project_id}`} className="inline-flex items-center gap-1 font-medium text-primary hover:underline">
                {partner.project_name}{partner.project_code ? ` · ${partner.project_code}` : ""}<ArrowUpRight className="size-4" />
              </Link>
              <p className="text-xs text-muted-foreground">{partner.project_location || "No project address"}
                {partner.project_status ? ` · ${partner.project_status}` : ""}</p>
            </div>
            <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
              <Fact label="Address" value={partner.address} />
              <Fact label="Partner status" value={partner.partner_status || partner.partnership_status} />
              <Fact label="Partner since" value={formatDate(partner.created_at)} />
              <Fact label="Agreed contribution" value={partner.agreed_contribution === null ? null : formatPKR(partner.agreed_contribution)} />
              <Fact label="Received" value={formatPKR(partner.contributed)} />
            </div>
            {partner.notes && <div className="mt-3 text-sm"><Fact label="Notes" value={partner.notes} /></div>}
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t pt-4">
              <p className="text-sm font-medium">Payments ({payments.length})</p>
              <Button size="sm" variant="outline" onClick={() => setSelectedPartner(partner)}>
                <Plus className="size-4" />Record Contribution
              </Button>
            </div>
            {payments.length === 0 ? <p className="mt-3 text-sm text-muted-foreground">No contributions recorded yet.</p> :
              <div className="mt-3 space-y-2">{payments.map((payment) =>
                <div key={payment.id} className="rounded-md border p-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span>{formatDate(payment.date)} · <span className="capitalize">{payment.method || "Other"}</span></span>
                    <strong>{formatPKR(payment.amount)}</strong>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{payment.description || "Contribution"}
                    {payment.reference ? ` · Ref: ${payment.reference}` : ""}</p>
                  <PaymentDetailsView transaction={payment} />
                </div>)}</div>}
          </section>;
        })}</div>}
    </>}
    {selectedPartner && <ProjectPartnerDialog projectId={selectedPartner.project_id} partner={selectedPartner}
      onOpenChange={(open) => { if (!open) setSelectedPartner(null); }} onContribution={recordContribution} />}
  </div>;
}

function Summary({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg border bg-card p-4">
    <p className="text-sm text-muted-foreground">{label}</p>
    <p className="mt-2 text-lg font-semibold">{value}</p>
  </div>;
}

function Fact({ label, value }: { label: string; value: string | null }) {
  return <div><p className="text-xs text-muted-foreground">{label}</p>
    <p className="mt-0.5 font-medium">{value || "—"}</p></div>;
}
