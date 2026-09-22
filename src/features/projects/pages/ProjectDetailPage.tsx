import { useEffect, useState } from "react";
import { ArrowLeft, Pencil, Plus, Trash2 } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PageHeader } from "@/components/PageHeader";
import { getProjectById } from "@/data/repositories/projectsRepository";
import { decodeBuildingSpaces, decodeFloorLayout, getProjectBuildingDetails, saveProjectBuildingDetails,
  type BuildingDetailsInput } from "@/data/repositories/projectBuildingRepository";
import { addActualProjectCost, addProjectEstimate, archiveProjectEstimate, listActualProjectCosts, listProjectEstimates, updateProjectEstimate,
  type ActualCostInput, type EstimateInput } from "@/data/repositories/projectFinanceRepository";
import type { Project, ProjectBuildingDetails, ProjectEstimate, Transaction } from "@/domain/types";
import { formatPKR } from "@/domain/money";
import { formatDate } from "@/lib/dates";
import { ProjectEntryDialog } from "@/features/projects/components/ProjectEntryDialog";
import { BuildingDetailsDialog } from "@/features/projects/components/BuildingDetailsDialog";
import { ProjectPartnerDialog } from "@/features/projects/components/ProjectPartnerDialog";
import { PaymentDetailsView } from "@/features/partners/components/PaymentDetailsView";
import { BuildingMixChart, EstimateChart, OwnershipChart, SpendingChart } from "@/features/projects/components/ProjectInsights";
import { addPartnerContribution, addProjectPartner, listPartnerContributions, listProjectPartners,
  type AddProjectPartnerInput, type PartnerContributionInput,
  type ProjectPartnerRow } from "@/data/repositories/projectPartnersRepository";

type Tab = "building" | "partners" | "estimate" | "actual";
type EntryMode = "estimate" | "actual";
const projectTabs: { id: Tab; label: string }[] = [
  { id: "building", label: "Building" },
  { id: "partners", label: "Partners" },
  { id: "estimate", label: "Estimate" },
  { id: "actual", label: "Actual Cost" },
];
const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);

export function ProjectDetailPage() {
  const { projectId } = useParams();
  const [project, setProject] = useState<Project | null>(null);
  const [buildingDetails, setBuildingDetails] = useState<ProjectBuildingDetails | null>(null);
  const [buildingDialogOpen, setBuildingDialogOpen] = useState(false);
  const [partners, setPartners] = useState<ProjectPartnerRow[]>([]);
  const [contributions, setContributions] = useState<Transaction[]>([]);
  const [partnerDialog, setPartnerDialog] = useState<ProjectPartnerRow | "new" | null>(null);
  const [estimates, setEstimates] = useState<ProjectEstimate[]>([]);
  const [actualCosts, setActualCosts] = useState<Transaction[]>([]);
  const [tab, setTab] = useState<Tab>("building");
  const [dialog, setDialog] = useState<EntryMode | null>(null);
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

  return <div>
    <Link to="/projects" className="mb-5 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
      <ArrowLeft className="size-4" />Back to Projects
    </Link>
    {loading && <p className="py-8 text-sm text-muted-foreground">Loading project…</p>}
    {!loading && error && <p role="alert" className="py-8 text-sm text-destructive">Could not load project: {error}</p>}
    {!loading && !error && !project && <p className="py-8 text-sm text-muted-foreground">Project not found.</p>}
    {!loading && !error && project && <>
      <PageHeader title={project.name} description={`${project.location || "No address"} · ${project.status || "Planning"}`} />
      {project.description && <p className="mb-6 text-sm text-muted-foreground">{project.description}</p>}

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
          {decodeBuildingSpaces(buildingDetails.selected_spaces_json ?? "[]").length > 0 &&
            <div className="mb-5 flex flex-wrap gap-2">
              {decodeBuildingSpaces(buildingDetails.selected_spaces_json ?? "[]").map((space) =>
                <span key={space} className="rounded-full bg-muted px-2.5 py-1 text-xs capitalize">{space.replace(/_/g, " ")}</span>)}
            </div>}
          <BuildingMixChart details={buildingDetails} />
          <div className="project-details-grid grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Detail label="Building use" value={buildingDetails.building_use?.replace("-", " ")} />
            <Detail label="Floors above ground" value={buildingDetails.floors_above_ground} />
            <Detail label="Basements" value={buildingDetails.basement_count} />
            <Detail label="Planned flats" value={buildingDetails.planned_flats} />
            <Detail label="Planned shops" value={buildingDetails.planned_shops} />
            <Detail label="Planned offices" value={buildingDetails.planned_offices} />
            <Detail label="Planned houses" value={buildingDetails.planned_houses} />
            <Detail label="Parking area" value={buildingDetails.parking_area_value === null ? null :
              `${buildingDetails.parking_area_value} ${buildingDetails.parking_area_unit === "sqyd" ? "sq yd" : "sq ft"}`} />
            {buildingDetails.planned_parking_spaces !== null && buildingDetails.parking_area_value === null &&
              <Detail label="Legacy parking spaces" value={buildingDetails.planned_parking_spaces} />}
            <Detail label="Masjid" value={buildingDetails.has_masjid ? "Included" : "—"} />
            <Detail label="Plot area" value={buildingDetails.plot_area_value === null ? null :
              `${buildingDetails.plot_area_value} ${buildingDetails.plot_area_unit}`} />
            <Detail label="Covered area" value={buildingDetails.covered_area_sqft === null ? null :
              `${buildingDetails.covered_area_sqft} sq ft`} />
          </div>
          {buildingDetails.notes && <p className="mt-5 border-t pt-4 text-sm text-muted-foreground">{buildingDetails.notes}</p>}
          {decodeFloorLayout(buildingDetails.floor_layout_json ?? "[]").some((floor) => floor.flat_types.length > 0) &&
            <div className="mt-5 border-t pt-4">
              <h3 className="mb-3 text-sm font-semibold">Flat layout by floor</h3>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {decodeFloorLayout(buildingDetails.floor_layout_json ?? "[]").filter((floor) => floor.flat_types.length > 0)
                  .map((floor) => <div key={floor.floor_index} className="rounded-md border px-3 py-2 text-sm">
                    <span className="font-medium">{floor.floor_index === 0 ? "Ground floor" : `Floor ${floor.floor_index}`}</span>
                    <span className="mt-1 block text-muted-foreground">
                      {floor.flat_types.map((type) => `${type.count} × ${type.rooms}-room flat${type.count === 1 ? "" : "s"}`).join(", ")}
                    </span>
                  </div>)}
              </div>
            </div>}
        </> : <p className="text-sm text-muted-foreground">No building details added yet.</p>}
      </section>}

      {tab === "partners" && <section id="project-panel-partners" role="tabpanel" aria-labelledby="project-tab-partners" className="project-detail-section mb-8 rounded-xl border bg-card p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Project Partners</h2>
            <p className="text-sm text-muted-foreground">Ownership shares and money received for this project.</p>
          </div>
          <Button onClick={() => setPartnerDialog("new")} disabled={allocatedShareBp >= 10_000}>
            <Plus className="size-4" />Add Partner
          </Button>
        </div>
        <div className="mb-4 grid gap-3 sm:grid-cols-3">
          <Summary title="Allocated shares" value={`${(allocatedShareBp / 100).toFixed(2)}%`} />
          <Summary title="Unallocated share" value={`${((10_000 - allocatedShareBp) / 100).toFixed(2)}%`} />
          <Summary title="Total received" value={formatPKR(contributedTotal)} />
        </div>
        <OwnershipChart partners={partners} />
        {partners.length === 0 ? <p className="rounded-lg border p-6 text-sm text-muted-foreground">No partners added yet.</p> :
          <div className="grid gap-3 lg:grid-cols-2">
            {partners.map((partner) => <div key={partner.partnership_id} className="rounded-lg border p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div><h3 className="font-semibold">{partner.name}</h3>
                  <p className="text-sm text-muted-foreground">{partner.phone || "No mobile number"}
                    {partner.phone2 ? ` · ${partner.phone2}` : ""}</p></div>
                <span className="rounded-full bg-muted px-2.5 py-1 text-sm font-medium">{(partner.share_bp / 100).toFixed(2)}%</span>
              </div>
              {partner.address && <p className="mt-2 text-sm text-muted-foreground">{partner.address}</p>}
              {partner.notes && <p className="mt-2 text-sm text-muted-foreground">{partner.notes}</p>}
              <div className="mt-3 grid gap-2 border-t pt-3 text-sm sm:grid-cols-2">
                <div><span className="text-muted-foreground">Agreed:</span> {partner.agreed_contribution === null ? "—" : formatPKR(partner.agreed_contribution)}</div>
                <div><span className="text-muted-foreground">Received:</span> {formatPKR(partner.contributed)}</div>
              </div>
              <Button type="button" variant="outline" size="sm" className="mt-3" onClick={() => setPartnerDialog(partner)}>
                <Plus className="size-4" />Record Contribution
              </Button>
            </div>)}
          </div>}
        {contributions.length > 0 && <div className="mt-5 overflow-x-auto rounded-lg border">
          <table className="w-full text-sm"><thead className="bg-muted/50 text-left text-muted-foreground"><tr>
            <th className="px-4 py-3 font-medium">Date</th><th className="px-4 py-3 font-medium">Partner</th>
            <th className="px-4 py-3 font-medium">Details</th><th className="px-4 py-3 text-right font-medium">Received</th>
          </tr></thead><tbody>{contributions.map((item) => <tr key={item.id} className="border-t">
            <td className="px-4 py-3">{formatDate(item.date)}</td>
            <td className="px-4 py-3">{partners.find((partner) => partner.partner_id === item.partner_id)?.name ?? "Partner"}</td>
            <td className="px-4 py-3">{item.description || "Contribution"}
              <span className="block text-xs text-muted-foreground">{item.method || "—"}{item.reference ? ` · ${item.reference}` : ""}</span>
              <PaymentDetailsView transaction={item} /></td>
            <td className="px-4 py-3 text-right font-medium">{formatPKR(item.amount)}</td>
          </tr>)}</tbody></table>
        </div>}
      </section>}

      {tab === "estimate" && <div id="project-panel-estimate" role="tabpanel" aria-labelledby="project-tab-estimate">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Project estimate</h2>
            <p className="text-sm text-muted-foreground">Plan minimum and maximum costs and expected recovery.</p>
          </div>
          <Button onClick={() => { setEditingEstimate(null); setDialog("estimate"); }}><Plus className="size-4" />Add Estimate Item</Button>
        </div>
        <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <Summary title="Estimated costs" value={`${formatPKR(costMin)} – ${formatPKR(costMax)}`} />
          <Summary title="Expected recovery" value={`${formatPKR(revenueMin)} – ${formatPKR(revenueMax)}`} />
          <Summary title="Projected margin range" value={revenues.length ?
            `${formatPKR(revenueMin - costMax)} – ${formatPKR(revenueMax - costMin)}` : "Add recovery items"} />
        </div>
        <div className="project-insight-grid"><EstimateChart items={costs} title="Estimated cost breakdown" /><EstimateChart items={revenues} title="Expected recovery breakdown" /></div>
        <EstimateSection title="Cost items" items={costs} onDelete={setItemToDelete}
          onEdit={(item) => { setEditingEstimate(item); setDialog("estimate"); }} />
        <EstimateSection title="Recovery / revenue items" items={revenues} onDelete={setItemToDelete}
          onEdit={(item) => { setEditingEstimate(item); setDialog("estimate"); }} />
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
      {dialog && <ProjectEntryDialog mode={dialog} projectId={project.id} estimate={editingEstimate}
        onOpenChange={(open) => { if (!open) { setDialog(null); setEditingEstimate(null); } }}
        onEstimate={saveEstimate} onActual={saveActual} />}
      {buildingDialogOpen && <BuildingDetailsDialog projectId={project.id} details={buildingDetails}
        onOpenChange={setBuildingDialogOpen} onSubmit={saveBuildingDetails} />}
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

function Detail({ label, value }: { label: string; value: string | number | null | undefined }) {
  return <div>
    <p className="text-xs text-muted-foreground">{label}</p>
    <p className="mt-1 text-sm font-medium capitalize">{value ?? "—"}</p>
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
