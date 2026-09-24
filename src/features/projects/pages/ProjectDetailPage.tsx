import { useEffect, useState } from "react";
import { ArrowLeft, BriefcaseBusiness, Building2, ChevronDown, ChevronRight, House, Landmark, Layers, MapPin, ParkingSquare, Pencil, Ruler, Store, Trash2, UserRound, Plus, type LucideIcon } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getProjectById, ProjectStatuses, updateProjectStatus, type ProjectStatus } from "@/data/repositories/projectsRepository";
import { decodeBuildingSpaces, getProjectBuildingDetails, saveProjectBuildingDetails,
  type BuildingDetailsInput } from "@/data/repositories/projectBuildingRepository";
import { addActualProjectCost, addProjectEstimate, archiveProjectEstimate, listActualProjectCosts, listProjectEstimates, updateProjectEstimate,
  type ActualCostInput, type EstimateInput } from "@/data/repositories/projectFinanceRepository";
import type { Project, ProjectBuildingDetails, ProjectEstimate, Transaction } from "@/domain/types";
import { formatPKR } from "@/domain/money";
import { formatDate } from "@/lib/dates";
import { ProjectEntryDialog } from "@/features/projects/components/ProjectEntryDialog";
import { flatRecoveryLines, recoveryLink } from "@/features/projects/components/recoverySpaces";
import { BuildingDetailsDialog } from "@/features/projects/components/BuildingDetailsDialog";
import { ProjectDashboard } from "@/features/projects/components/ProjectDashboard";
import { ProjectStatusProgress } from "@/features/projects/components/ProjectStatusProgress";
import { ProjectPartnerDialog } from "@/features/projects/components/ProjectPartnerDialog";
import { PaymentDetailsView } from "@/features/partners/components/PaymentDetailsView";
import { BuildingAreaChart, BuildingLevelsChart, BuildingMixChart, EstimateChart, FlatLayoutChart, OwnershipChart, PartnerFundingChart, SpendingChart } from "@/features/projects/components/ProjectInsights";
import { addPartnerContribution, addProjectPartner, listPartnerContributions, listProjectPartners,
  type AddProjectPartnerInput, type PartnerContributionInput,
  type ProjectPartnerRow } from "@/data/repositories/projectPartnersRepository";

type Tab = "dashboard" | "building" | "partners" | "estimate" | "actual";
type BuildingTab = "overview" | "floors" | "areas";
type EntryMode = "estimate" | "actual";
const projectTabs: { id: Tab; label: string }[] = [
  { id: "dashboard", label: "Dashboard" },
  { id: "building", label: "Building" },
  { id: "partners", label: "Partners" },
  { id: "estimate", label: "Estimate" },
  { id: "actual", label: "Actual Cost" },
];
const buildingTabs: { id: BuildingTab; label: string; description: string }[] = [
  { id: "overview", label: "At a glance", description: "See what is planned for this building." },
  { id: "floors", label: "Floors & flats", description: "See the floors and which flats are planned on each one." },
  { id: "areas", label: "Areas & details", description: "See measurements and the rest of the saved plan." },
];
const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);

export function ProjectDetailPage() {
  const { projectId } = useParams();
  const [project, setProject] = useState<Project | null>(null);
  const [buildingDetails, setBuildingDetails] = useState<ProjectBuildingDetails | null>(null);
  const [buildingDialogOpen, setBuildingDialogOpen] = useState(false);
  const [statusDialogOpen, setStatusDialogOpen] = useState(false);
  const [statusDraft, setStatusDraft] = useState<ProjectStatus>("planning");
  const [savingStatus, setSavingStatus] = useState(false);
  const [statusError, setStatusError] = useState("");
  const [partners, setPartners] = useState<ProjectPartnerRow[]>([]);
  const [contributions, setContributions] = useState<Transaction[]>([]);
  const [partnerDialog, setPartnerDialog] = useState<ProjectPartnerRow | "new" | null>(null);
  const [selectedPartnerId, setSelectedPartnerId] = useState<string | null>(null);
  const [estimates, setEstimates] = useState<ProjectEstimate[]>([]);
  const [actualCosts, setActualCosts] = useState<Transaction[]>([]);
  const [tab, setTab] = useState<Tab>("dashboard");
  const [buildingTab, setBuildingTab] = useState<BuildingTab>("overview");
  const [dialog, setDialog] = useState<EntryMode | null>(null);
  const [estimateKind, setEstimateKind] = useState<"cost" | "revenue">("cost");
  const [editingEstimate, setEditingEstimate] = useState<ProjectEstimate | null>(null);
  const [itemToDelete, setItemToDelete] = useState<ProjectEstimate | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!projectId) return;
    let active = true;
    Promise.all([getProjectById(projectId), getProjectBuildingDetails(projectId),
      listProjectEstimates(projectId), listActualProjectCosts(projectId),
      listProjectPartners(projectId), listPartnerContributions(projectId)])
      .then(([projectRow, buildingRow, estimateRows, costRows, partnerRows, contributionRows]) => {
        if (!active) return;
        setProject(projectRow);
        setBuildingDetails(buildingRow);
        setEstimates(estimateRows);
        setActualCosts(costRows);
        setPartners(partnerRows);
        setContributions(contributionRows);
      })
      .catch((cause) => { if (active) setError(String(cause)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [projectId]);

  async function saveEstimate(value: EstimateInput) {
    if (editingEstimate) {
      const row = await updateProjectEstimate(editingEstimate.id, value);
      setEstimates((current) => current.map((item) => item.id === row.id ? row : item));
      toast.success("Estimate item updated");
    } else {
      const row = await addProjectEstimate(value);
      setEstimates((current) => [...current, row]);
      toast.success("Estimate item added");
    }
  }

  async function saveActual(value: ActualCostInput) {
    const row = await addActualProjectCost(value);
    setActualCosts((current) => [row, ...current]);
    toast.success("Actual cost recorded");
  }

  async function saveBuildingDetails(value: BuildingDetailsInput) {
    const row = await saveProjectBuildingDetails(value);
    setBuildingDetails(row);
    toast.success("Building details saved");
  }

  async function saveStatus() {
    if (!project) return;
    setSavingStatus(true);
    setStatusError("");
    try {
      const updated = await updateProjectStatus(project.id, statusDraft);
      setProject(updated);
      setStatusDialogOpen(false);
      toast.success("Project status updated");
    } catch (cause) {
      setStatusError(`Could not update status: ${String(cause)}`);
    } finally {
      setSavingStatus(false);
    }
  }

  async function refreshPartners(id: string) {
    const [partnerRows, contributionRows] = await Promise.all([
      listProjectPartners(id), listPartnerContributions(id),
    ]);
    setPartners(partnerRows);
    setContributions(contributionRows);
  }

  async function savePartner(value: AddProjectPartnerInput) {
    await addProjectPartner(value);
    toast.success("Partner added");
    try { await refreshPartners(value.project_id); }
    catch { toast.error("Partner saved. Refresh the page to see the latest details."); }
  }

  async function saveContribution(value: PartnerContributionInput) {
    await addPartnerContribution(value);
    toast.success("Partner contribution recorded");
    try { await refreshPartners(value.project_id); }
    catch { toast.error("Contribution saved. Refresh the page to see the latest details."); }
  }

  async function deleteEstimate() {
    if (!projectId || !itemToDelete) return;
    setDeleting(true);
    setDeleteError("");
    try {
      await archiveProjectEstimate(projectId, itemToDelete.id);
      setEstimates((current) => current.filter((item) => item.id !== itemToDelete.id));
      setItemToDelete(null);
      toast.success("Estimate item deleted");
    } catch (cause) {
      setDeleteError(`Could not delete item: ${String(cause)}`);
    } finally {
      setDeleting(false);
    }
  }

  function closeDeleteDialog() {
    setItemToDelete(null);
    setDeleteError("");
  }

  const costs = estimates.filter((item) => item.kind === "cost");
  const revenues = estimates.filter((item) => item.kind === "revenue");
  const costMin = sum(costs.map((item) => item.minimum_amount));
  const costMax = sum(costs.map((item) => item.maximum_amount));
  const revenueMin = sum(revenues.map((item) => item.minimum_amount));
  const revenueMax = sum(revenues.map((item) => item.maximum_amount));
  const actualTotal = sum(actualCosts.map((item) => item.amount));
  const allocatedShareBp = sum(partners.map((item) => item.share_bp));
  const contributedTotal = sum(contributions.map((item) => item.amount));
  const selectedPartner = partners.find((item) => item.partnership_id === selectedPartnerId) ?? null;
  const selectedSpaces = buildingDetails ? decodeBuildingSpaces(buildingDetails.selected_spaces_json ?? "[]") : [];
  const showPlannedSpace = (space: typeof selectedSpaces[number]) => selectedSpaces.length === 0 || selectedSpaces.includes(space);

  return <div>
    {loading && <p className="py-8 text-sm text-muted-foreground">Loading project…</p>}
    {!loading && error && <p role="alert" className="py-8 text-sm text-destructive">Could not load project: {error}</p>}
    {!loading && !error && !project && <p className="py-8 text-sm text-muted-foreground">Project not found.</p>}
    {!loading && !error && project && <>
      <section className="project-heading-card" aria-label="Project and status">
        <div className="project-heading-top">
          <div><Link to="/projects" className="project-heading-back"><ArrowLeft className="size-4" />Back to Projects</Link>
            <h1>{project.name}</h1><p>{project.location || "No address"}</p></div>
          <Button variant="outline" onClick={() => {
            setStatusDraft(ProjectStatuses.includes(project.status as ProjectStatus) ? project.status as ProjectStatus : "planning");
            setStatusError("");
            setStatusDialogOpen(true);
          }}><Pencil className="size-4" />Change Status</Button>
        </div>
        <ProjectStatusProgress status={project.status} />
      </section>

      <div role="tablist" aria-label="Project details" className="project-detail-tabs">
        {projectTabs.map(({ id, label }, index) => <button key={id} id={`project-tab-${id}`} type="button" role="tab"
          aria-selected={tab === id} aria-controls={`project-panel-${id}`} tabIndex={tab === id ? 0 : -1}
          onClick={() => setTab(id)} onKeyDown={(event) => {
            const next = event.key === "ArrowRight" ? (index + 1) % projectTabs.length :
              event.key === "ArrowLeft" ? (index - 1 + projectTabs.length) % projectTabs.length :
              event.key === "Home" ? 0 : event.key === "End" ? projectTabs.length - 1 : -1;
            if (next >= 0) { event.preventDefault(); setTab(projectTabs[next].id); document.getElementById(`project-tab-${projectTabs[next].id}`)?.focus(); }
          }}>{label}</button>)}
      </div>

      {tab === "dashboard" && <ProjectDashboard project={project} buildingDetails={buildingDetails}
        partners={partners} contributions={contributions} estimates={estimates} actualCosts={actualCosts} />}

      {tab === "building" && <section id="project-panel-building" role="tabpanel" aria-labelledby="project-tab-building" className="project-detail-section mb-8 rounded-xl border bg-card p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Building Details</h2>
            <p className="text-sm text-muted-foreground">Planned floors, units and areas for this project.</p>
          </div>
          <Button variant="outline" onClick={() => setBuildingDialogOpen(true)}>
            <Pencil className="size-4" />{buildingDetails ? "Edit Details" : "Add Details"}
          </Button>
        </div>
        {buildingDetails ? <>
          <div role="tablist" aria-label="Building details" className="building-detail-tabs">
            {buildingTabs.map(({ id, label }, index) => <button key={id} id={`building-tab-${id}`} type="button" role="tab"
              aria-selected={buildingTab === id} aria-controls={`building-panel-${id}`} tabIndex={buildingTab === id ? 0 : -1}
              onClick={() => setBuildingTab(id)} onKeyDown={(event) => {
                const next = event.key === "ArrowRight" ? (index + 1) % buildingTabs.length :
                  event.key === "ArrowLeft" ? (index - 1 + buildingTabs.length) % buildingTabs.length :
                  event.key === "Home" ? 0 : event.key === "End" ? buildingTabs.length - 1 : -1;
                if (next >= 0) { event.preventDefault(); const target = buildingTabs[next].id; setBuildingTab(target); document.getElementById(`building-tab-${target}`)?.focus(); }
              }}>{label}</button>)}
          </div>
          <p className="building-tab-description">{buildingTabs.find((item) => item.id === buildingTab)?.description}</p>
          {buildingTab === "overview" && <div id="building-panel-overview" role="tabpanel" aria-labelledby="building-tab-overview" className="building-tab-panel">
          {selectedSpaces.length > 0 &&
            <div className="flex flex-wrap gap-2">
              {selectedSpaces.map((space) =>
                <span key={space} className="rounded-full bg-muted px-2.5 py-1 text-xs capitalize">{space.replace(/_/g, " ")}</span>)}
            </div>}
          <div className="building-overview-chart"><BuildingMixChart details={buildingDetails} /></div>
          <div className="building-overview-facts">
            <Detail label="Building use" value={buildingDetails.building_use?.replace("-", " ")} icon={Building2} />
            <Detail label="Floors above ground" value={buildingDetails.floors_above_ground} icon={Layers} />
            {showPlannedSpace("flats") && <Detail label="Planned flats" value={buildingDetails.planned_flats} icon={House} />}
            {showPlannedSpace("shops") && <Detail label="Planned shops" value={buildingDetails.planned_shops} icon={Store} />}
          </div>
          </div>}
          {buildingTab === "floors" && <div id="building-panel-floors" role="tabpanel" aria-labelledby="building-tab-floors" className="building-tab-panel">
          <div className="building-floors-chart"><BuildingLevelsChart details={buildingDetails} /></div>
          <FlatLayoutChart details={buildingDetails} />
          </div>}
          {buildingTab === "areas" && <div id="building-panel-areas" role="tabpanel" aria-labelledby="building-tab-areas" className="building-tab-panel">
          <div className="building-area-insight"><BuildingAreaChart details={buildingDetails} /></div>
          <div className="building-facts-heading"><h3>Plan highlights</h3><p>Only details saved for this building appear here.</p></div>
          <div className="project-details-grid">
            <Detail label="Building use" value={buildingDetails.building_use?.replace("-", " ")} icon={Building2} />
            <Detail label="Floors above ground" value={buildingDetails.floors_above_ground} icon={Layers} />
            <Detail label="Basements" value={buildingDetails.basement_count} icon={Layers} />
            {showPlannedSpace("flats") && <Detail label="Planned flats" value={buildingDetails.planned_flats} icon={House} />}
            {showPlannedSpace("shops") && <Detail label="Planned shops" value={buildingDetails.planned_shops} icon={Store} />}
            {showPlannedSpace("offices") && <Detail label="Planned offices" value={buildingDetails.planned_offices} icon={BriefcaseBusiness} />}
            {showPlannedSpace("houses") && <Detail label="Planned houses" value={buildingDetails.planned_houses} icon={House} />}
            {showPlannedSpace("parking") && <Detail label="Parking area" value={buildingDetails.parking_area_value === null ? null :
              `${buildingDetails.parking_area_value.toLocaleString()} ${buildingDetails.parking_area_unit === "sqyd" ? "sq yd" : "sq ft"}`} icon={ParkingSquare} />
            }
            {buildingDetails.planned_parking_spaces !== null && buildingDetails.parking_area_value === null &&
              <Detail label="Parking spaces" value={buildingDetails.planned_parking_spaces} icon={ParkingSquare} />}
            {buildingDetails.has_masjid === 1 && <Detail label="Masjid" value="Included" icon={Landmark} />}
            <Detail label="Plot area" value={buildingDetails.plot_area_value === null ? null :
              `${buildingDetails.plot_area_value.toLocaleString()} ${buildingDetails.plot_area_unit}`} icon={MapPin} />
            <Detail label="Covered area" value={buildingDetails.covered_area_sqft === null ? null :
              `${buildingDetails.covered_area_sqft.toLocaleString()} sq ft`} icon={Ruler} />
          </div>
          {buildingDetails.notes && <p className="mt-5 border-t pt-4 text-sm text-muted-foreground">{buildingDetails.notes}</p>}
          </div>}
        </> : <p className="text-sm text-muted-foreground">No building details added yet.</p>}
      </section>}

      {tab === "partners" && <section id="project-panel-partners" role="tabpanel" aria-labelledby="project-tab-partners" className="project-partners-panel project-detail-section mb-8 rounded-xl border bg-card p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Project Partners</h2>
            <p className="text-sm text-muted-foreground">Ownership shares and money received for this project.</p>
          </div>
          <Button onClick={() => setPartnerDialog("new")} disabled={allocatedShareBp >= 10_000}>
            <Plus className="size-4" />Add Partner
          </Button>
        </div>
        <div className="partner-section-heading"><div><h3>Partner profiles</h3><p>Select a profile to see its full details and record a payment.</p></div><span>{partners.length} {partners.length === 1 ? "partner" : "partners"}</span></div>
        {partners.length === 0 ? <p className="rounded-lg border p-6 text-sm text-muted-foreground">No partners added yet. Use Add Partner to create the first profile.</p> :
          <div className="partner-cards">
            {partners.map((partner) => <article key={partner.partnership_id} className="partner-card rounded-lg border p-4">
              <button type="button" className="partner-profile-toggle" aria-label={`View ${partner.name}'s details`} onClick={() => setSelectedPartnerId(partner.partnership_id)}>
                <span className="partner-profile-top"><span className="partner-profile-avatar"><UserRound size={24} /></span>
                  <span className="partner-profile-main"><strong>{partner.name}</strong><span>{partner.phone || "Phone not added"}</span></span>
                  <ChevronRight size={18} className="partner-chevron" /></span>
                <span className="partner-card-chart" role="img" aria-label={`${partner.name} owns ${(partner.share_bp / 100).toFixed(2)} percent of this project`} style={{ background: `conic-gradient(#d8a72f ${partner.share_bp / 100}%, var(--muted) 0)` }}><span><strong>{(partner.share_bp / 100).toFixed(2)}%</strong><small>project share</small></span></span>
                <span className="partner-profile-quick"><span>Received <strong>{formatPKR(partner.contributed)}</strong></span><span>{partner.agreed_contribution === null ? "No payment target set" : `Remaining ${formatPKR(Math.max(0, partner.agreed_contribution - partner.contributed))}`}</span></span>
                {partner.agreed_contribution !== null && <span className="partner-card-payment-chart"><span className="partner-card-payment-label">Payment progress</span><span className="partner-funding-track" role="img" aria-label={`${partner.name}: ${formatPKR(partner.contributed)} received, ${formatPKR(Math.max(0, partner.agreed_contribution - partner.contributed))} remaining`}><span style={{ width: `${partner.agreed_contribution > 0 ? Math.min(100, partner.contributed / partner.agreed_contribution * 100) : 100}%` }} /></span></span>}
                <span className="partner-card-more">View details <ChevronRight size={15} /></span>
              </button>
            </article>)}
          </div>}
        <div className="partner-overview-heading"><h3>Project picture</h3><p>These charts combine the information from all partner profiles.</p></div>
        <div className="mb-4 grid gap-3 sm:grid-cols-3">
          <Summary title="Share assigned to partners" value={`${(allocatedShareBp / 100).toFixed(2)}%`} />
          <Summary title="Share still available" value={`${((10_000 - allocatedShareBp) / 100).toFixed(2)}%`} />
          <Summary title="Money received so far" value={formatPKR(contributedTotal)} />
        </div>
        {partners.length > 0 && <div className="partner-insight-grid"><OwnershipChart partners={partners} /><PartnerFundingChart partners={partners} /></div>}
        {contributions.length > 0 && <details className="partner-payments"><summary className="partner-payments-heading"><h3>Payment history</h3><span>{contributions.length} {contributions.length === 1 ? "payment" : "payments"} <ChevronDown size={16} /></span></summary>
          <div className="partner-payment-list">{contributions.map((item) => <article key={item.id} className="partner-payment">
            <span className="partner-payment-dot" aria-hidden="true" />
            <div className="partner-payment-main"><strong>{partners.find((partner) => partner.partner_id === item.partner_id)?.name ?? "Partner"}</strong><p>{item.description || "Partner payment"}</p><small>{formatDate(item.date)} · {item.method || "Method not set"}{item.reference ? ` · ${item.reference}` : ""}</small><PaymentDetailsView transaction={item} /></div>
            <strong className="partner-payment-amount">+ {formatPKR(item.amount)}</strong>
          </article>)}</div>
        </details>}
      </section>}

      {tab === "estimate" && <div id="project-panel-estimate" role="tabpanel" aria-labelledby="project-tab-estimate">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Project estimate</h2>
            <p className="text-sm text-muted-foreground">Plan minimum and maximum costs and expected recovery.</p>
          </div>
          <div className="estimate-actions">
            <Button onClick={() => { setEditingEstimate(null); setEstimateKind("cost"); setDialog("estimate"); }}><Plus className="size-4" />Add Expected Cost</Button>
            <Button variant="outline" onClick={() => { setEditingEstimate(null); setEstimateKind("revenue"); setDialog("estimate"); }}><Plus className="size-4" />Add Expected Recovery</Button>
          </div>
        </div>
        <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <Summary title="Estimated costs" value={`${formatPKR(costMin)} – ${formatPKR(costMax)}`} />
          <Summary title="Expected recovery" value={`${formatPKR(revenueMin)} – ${formatPKR(revenueMax)}`} />
          <Summary title="Projected margin range" value={revenues.length ?
            `${formatPKR(revenueMin - costMax)} – ${formatPKR(revenueMax - costMin)}` : "Add recovery items"} />
        </div>
        <div className="project-insight-grid"><EstimateChart items={costs} title="Estimated cost breakdown" /><EstimateChart items={revenues} title="Expected recovery breakdown" /></div>
        <EstimateSection title="Cost items" items={costs} onDelete={setItemToDelete}
          onEdit={(item) => { setEditingEstimate(item); setEstimateKind("cost"); setDialog("estimate"); }} />
        <EstimateSection title="Recovery / revenue items" items={revenues} onDelete={setItemToDelete}
          onEdit={(item) => { setEditingEstimate(item); setEstimateKind("revenue"); setDialog("estimate"); }} />
      </div>}
      {tab === "actual" && <div id="project-panel-actual" role="tabpanel" aria-labelledby="project-tab-actual">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Actual project costs</h2>
            <p className="text-sm text-muted-foreground">Payments recorded against this project in the ledger.</p>
          </div>
          <Button onClick={() => setDialog("actual")}><Plus className="size-4" />Add Actual Cost</Button>
        </div>
        <div className="mb-6 grid gap-3 sm:grid-cols-2">
          <Summary title="Total spent" value={formatPKR(actualTotal)} />
          <Summary title="Estimated cost range" value={`${formatPKR(costMin)} – ${formatPKR(costMax)}`} />
        </div>
        <SpendingChart costs={actualCosts} />
        {actualCosts.length === 0 ? <p className="rounded-lg border p-8 text-center text-sm text-muted-foreground">No actual costs recorded yet.</p> :
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-muted-foreground"><tr>
                <th className="px-4 py-3 font-medium">Date</th><th className="px-4 py-3 font-medium">Description</th>
                <th className="px-4 py-3 font-medium">Method</th><th className="px-4 py-3 text-right font-medium">Amount</th>
              </tr></thead>
              <tbody>{actualCosts.map((item) => <tr key={item.id} className="border-t">
                <td className="px-4 py-3">{formatDate(item.date)}</td>
                <td className="px-4 py-3">{item.description}{item.reference &&
                  <span className="block text-xs text-muted-foreground">Ref: {item.reference}</span>}</td>
                <td className="px-4 py-3 capitalize">{item.method || "—"}</td>
                <td className="px-4 py-3 text-right font-medium">{formatPKR(item.amount)}</td>
              </tr>)}</tbody>
            </table>
          </div>}
      </div>}
      {dialog && <ProjectEntryDialog mode={dialog} projectId={project.id} estimate={editingEstimate} estimateKind={estimateKind}
        buildingDetails={buildingDetails} recoveryEstimates={revenues}
        onOpenChange={(open) => { if (!open) { setDialog(null); setEditingEstimate(null); } }}
        onEstimate={saveEstimate} onActual={saveActual} />}
      {buildingDialogOpen && <BuildingDetailsDialog projectId={project.id} details={buildingDetails}
        onOpenChange={setBuildingDialogOpen} onSubmit={saveBuildingDetails} />}
      <Dialog open={statusDialogOpen} onOpenChange={(open) => { if (!savingStatus) setStatusDialogOpen(open); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Change project status</DialogTitle><p className="text-sm text-muted-foreground">Choose the stage that best describes this project now.</p></DialogHeader>
          <div className="space-y-2"><Label htmlFor="project-update-status">Project status</Label>
            <select id="project-update-status" className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={statusDraft} onChange={(event) => setStatusDraft(event.target.value as ProjectStatus)}>
              {ProjectStatuses.map((status) => <option key={status} value={status}>{status.charAt(0).toUpperCase() + status.slice(1)}</option>)}
            </select>
            <p className="text-xs text-muted-foreground">The new status will also appear on the Projects page.</p>
          </div>
          {statusError && <p role="alert" className="text-sm text-destructive">{statusError}</p>}
          <DialogFooter><Button type="button" variant="outline" disabled={savingStatus} onClick={() => setStatusDialogOpen(false)}>Cancel</Button>
            <Button type="button" disabled={savingStatus || statusDraft === project.status} onClick={saveStatus}>{savingStatus ? "Saving…" : "Save status"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={!!selectedPartner} onOpenChange={(open) => { if (!open) setSelectedPartnerId(null); }}>
        <DialogContent className="partner-dialog partner-profile-modal max-h-[90vh] overflow-y-auto sm:max-w-xl">
          {selectedPartner && <>
            <DialogHeader><DialogTitle className="flex items-center gap-3"><span className="partner-profile-avatar"><UserRound size={23} /></span><span>{selectedPartner.name}</span></DialogTitle></DialogHeader>
            <p className="text-sm text-muted-foreground">{(selectedPartner.share_bp / 100).toFixed(2)}% share in this project</p>
            <div className="partner-modal-facts">
              <p><span>Phone</span><strong>{selectedPartner.phone || "Not added"}</strong></p>
              {selectedPartner.phone2 && <p><span>Other phone</span><strong>{selectedPartner.phone2}</strong></p>}
              {selectedPartner.address && <p><span>Address</span><strong>{selectedPartner.address}</strong></p>}
              {selectedPartner.notes && <p><span>Notes</span><strong>{selectedPartner.notes}</strong></p>}
            </div>
            <div className="partner-modal-money">
              <div><span>Agreed contribution</span><strong>{selectedPartner.agreed_contribution === null ? "Not set" : formatPKR(selectedPartner.agreed_contribution)}</strong></div>
              <div><span>Money received</span><strong>{formatPKR(selectedPartner.contributed)}</strong></div>
              <div><span>Still to receive</span><strong>{selectedPartner.agreed_contribution === null ? "Unknown" : formatPKR(Math.max(0, selectedPartner.agreed_contribution - selectedPartner.contributed))}</strong></div>
            </div>
            {selectedPartner.agreed_contribution !== null ? <div className="partner-card-progress">
              <div className="partner-funding-track" role="img" aria-label={`${selectedPartner.name}: ${formatPKR(selectedPartner.contributed)} received, ${formatPKR(Math.max(0, selectedPartner.agreed_contribution - selectedPartner.contributed))} remaining`}>
                <div style={{ width: `${selectedPartner.agreed_contribution > 0 ? Math.min(100, selectedPartner.contributed / selectedPartner.agreed_contribution * 100) : 100}%` }} />
              </div>
              <span>{selectedPartner.contributed < selectedPartner.agreed_contribution ? `${formatPKR(selectedPartner.agreed_contribution - selectedPartner.contributed)} remaining` : selectedPartner.contributed > selectedPartner.agreed_contribution ? "Above agreed amount" : "Fully received"}</span>
            </div> : <p className="partner-no-agreement">No agreed amount was saved, so a remaining balance cannot be calculated.</p>}
            {contributions.some((item) => item.partner_id === selectedPartner.partner_id) && <div className="partner-modal-payments"><h3>Payments from {selectedPartner.name}</h3>
              {contributions.filter((item) => item.partner_id === selectedPartner.partner_id).map((item) => <div key={item.id} className="partner-modal-payment"><span>{formatDate(item.date)}<small>{item.description || "Partner payment"}</small><PaymentDetailsView transaction={item} /></span><strong>{formatPKR(item.amount)}</strong></div>)}
            </div>}
            <DialogFooter><Button type="button" onClick={() => { setPartnerDialog(selectedPartner); setSelectedPartnerId(null); }}><Plus className="size-4" />Record Payment</Button></DialogFooter>
          </>}
        </DialogContent>
      </Dialog>
      {partnerDialog && <ProjectPartnerDialog projectId={project.id}
        partner={partnerDialog === "new" ? undefined : partnerDialog}
        remainingShareBp={10_000 - allocatedShareBp}
        onOpenChange={(open) => { if (!open) setPartnerDialog(null); }}
        onAddPartner={savePartner} onContribution={saveContribution} />}
      <Dialog open={!!itemToDelete} onOpenChange={(open) => { if (!open && !deleting) closeDeleteDialog(); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Delete estimate item?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            {itemToDelete?.title} will be removed from this estimate and its totals.
          </p>
          {deleteError && <p role="alert" className="text-sm text-destructive">{deleteError}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" disabled={deleting} onClick={closeDeleteDialog}>Cancel</Button>
            <Button type="button" variant="destructive" disabled={deleting} onClick={deleteEstimate}>
              {deleting ? "Deleting…" : "Delete item"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>}
  </div>;
}

function Summary({ title, value }: { title: string; value: string }) {
  return <div className="rounded-lg border bg-card p-4">
    <p className="text-sm text-muted-foreground">{title}</p>
    <p className="mt-2 text-lg font-semibold">{value}</p>
  </div>;
}

function Detail({ label, value, icon: Icon }: { label: string; value: string | number | null | undefined; icon: LucideIcon }) {
  if (value === null || value === undefined || value === "") return null;
  return <div className="building-fact-card">
    <span className="building-fact-icon"><Icon size={21} aria-hidden="true" /></span>
    <span className="building-fact-copy"><span>{label}</span><strong>{typeof value === "number" ? value.toLocaleString() : value}</strong></span>
  </div>;
}

function EstimateSection({ title, items, onEdit, onDelete }: {
  title: string; items: ProjectEstimate[];
  onEdit: (item: ProjectEstimate) => void; onDelete: (item: ProjectEstimate) => void;
}) {
  return <section className="mb-6">
    <h3 className="mb-3 font-semibold">{title}</h3>
    {items.length === 0 ? <p className="rounded-lg border p-6 text-sm text-muted-foreground">No items added yet.</p> :
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-muted-foreground"><tr>
            <th className="px-4 py-3 font-medium">Item</th>
            <th className="px-4 py-3 text-right font-medium">Minimum</th>
            <th className="px-4 py-3 text-right font-medium">Maximum</th>
            <th className="px-4 py-3"><span className="sr-only">Actions</span></th>
          </tr></thead>
          <tbody>{items.map((item) => <tr key={item.id} className="border-t">
            <td className="px-4 py-3"><span className="font-medium">{item.title}</span>
              {recoveryLink(item) && <span className="block text-xs text-muted-foreground">{recoveryLink(item)!.quantity} planned {recoveryLink(item)!.space} × expected price per unit</span>}
              {flatRecoveryLines(item).map((line) => <span className="block text-xs text-muted-foreground" key={`${line.floor_index}-${line.rooms}`}>
                {line.floor_index === 0 ? "Ground" : `Floor ${line.floor_index}`}: {line.quantity} × {line.rooms}-room flats at {formatPKR(line.minimum_unit_price)} – {formatPKR(line.maximum_unit_price)} each
              </span>)}
              {item.details && <span className="block text-xs text-muted-foreground">{item.details}</span>}</td>
            <td className="px-4 py-3 text-right">{formatPKR(item.minimum_amount)}</td>
            <td className="px-4 py-3 text-right">{formatPKR(item.maximum_amount)}</td>
            <td className="px-4 py-3 text-right">
              <Button type="button" size="icon" variant="ghost" aria-label={`Edit ${item.title}`}
                onClick={() => onEdit(item)}>
                <Pencil className="size-4" />
              </Button>
              <Button type="button" size="icon" variant="ghost" aria-label={`Delete ${item.title}`}
                onClick={() => onDelete(item)} className="text-destructive hover:text-destructive">
                <Trash2 className="size-4" />
              </Button>
            </td>
          </tr>)}</tbody>
        </table>
      </div>}
  </section>;
}
