import { BankAccountSelect } from "@/components/BankAccountSelect";
import "./project-detail.css";
import { useEffect, useState } from "react";
import { format } from "date-fns";
import {
  ArrowLeft,
  Building2,
  ChevronDown,
  ChevronRight,
  Landmark,
  Layers,
  Pencil,
  Ruler,
  Trash2,
  UserRound,
  Plus,
  LayoutDashboard,
  Users,
  Calculator,
  Wallet,
  HardHat,
  MapPin,
  type LucideIcon,
} from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { toast } from "sonner";
import { useRecordFilters } from "@/components/RecordFilters";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  getProjectById,
  ProjectStatuses,
  updateProjectStatus,
  type ProjectStatus,
} from "@/data/repositories/projectsRepository";
import {
  getProjectLand,
  saveProjectStage,
  LandAcquisitionSchema,
  type ProjectLand,
} from "@/data/repositories/projectStageRepository";
import {
  decodeBuildingSpaces,
  getProjectBuildingDetails,
  saveProjectBuildingDetails,
  type BuildingDetailsInput,
} from "@/data/repositories/projectBuildingRepository";
import {
  addActualProjectCost,
  addConstructionCost,
  addProjectEstimate,
  archiveProjectEstimate,
  listActualProjectCosts,
  listConstructionCosts,
  listProjectEstimates,
  updateProjectEstimate,
  type ActualCostInput,
  type EstimateInput,
} from "@/data/repositories/projectFinanceRepository";
import type { Project, ProjectBuildingDetails, ProjectEstimate, Transaction } from "@/domain/types";
import { formatPKR } from "@/domain/money";
import { formatDate } from "@/lib/dates";
import { ProjectEntryDialog } from "@/features/projects/components/ProjectEntryDialog";
import { flatRecoveryLines, recoveryLink } from "@/features/projects/components/recoverySpaces";
import { BuildingDetailsDialog } from "@/features/projects/components/BuildingDetailsDialog";
import { BuildingOverview } from "@/features/projects/components/BuildingOverview";
import { BuildingFloorsOverview } from "@/features/projects/components/BuildingFloorsOverview";
import { BuildingAreasOverview } from "@/features/projects/components/BuildingAreasOverview";
import { ProjectDashboard } from "@/features/projects/components/ProjectDashboard";
import { ConstructionCostInsights } from "@/features/projects/components/ConstructionCostInsights";
import { ProjectStatusProgress } from "@/features/projects/components/ProjectStatusProgress";
import { ProjectPartnerDialog } from "@/features/projects/components/ProjectPartnerDialog";
import { PaymentDetailsView } from "@/features/partners/components/PaymentDetailsView";
import {
  BuildingAreaChart,
  EstimateChart,
  OwnershipChart,
  PartnerFundingChart,
  SpendingChart,
} from "@/features/projects/components/ProjectInsights";
import {
  addPartnerContribution,
  addProjectPartner,
  listPartnerContributions,
  listProjectPartners,
  type AddProjectPartnerInput,
  type PartnerContributionInput,
  type ProjectPartnerRow,
} from "@/data/repositories/projectPartnersRepository";

type Tab = "dashboard" | "building" | "partners" | "estimate" | "actual" | "construction";
type BuildingTab = "overview" | "floors" | "areas";
type EntryMode = "estimate" | "actual" | "construction";
const projectTabs: { id: Tab; label: string; icon: LucideIcon }[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "building", label: "Building", icon: Building2 },
  { id: "partners", label: "Partners", icon: Users },
  { id: "estimate", label: "Estimate", icon: Calculator },
  { id: "actual", label: "Actual Cost", icon: Wallet },
  { id: "construction", label: "Construction Cost", icon: HardHat },
];
const buildingTabs: { id: BuildingTab; label: string; description: string; icon: LucideIcon }[] = [
  {
    id: "overview",
    label: "At a glance",
    description: "See what is planned for this building.",
    icon: LayoutDashboard,
  },
  {
    id: "floors",
    label: "Floors & flats",
    description: "See the floors and which flats are planned on each one.",
    icon: Layers,
  },
  {
    id: "areas",
    label: "Areas & details",
    description: "See measurements and the rest of the saved plan.",
    icon: Ruler,
  },
];
const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);

function landPurchaseCost(projectId: string, land: ProjectLand | null): Transaction | null {
  if (!land?.price) return null;
  return {
    id: `land-purchase-${land.id || projectId}`,
    date: land.purchase_date,
    amount: land.price,
    direction: "out",
    type: "land_purchase",
    method: null,
    reference: null,
    description: `Land purchase: ${land.title}`,
    project_id: projectId,
    land_id: land.id || null,
    partner_id: null,
    contact_id: null,
    receipt_document_id: null,
    created_at: land.purchase_date,
    updated_at: land.purchase_date,
    archived: 0,
    custom: "{}",
  };
}

export function ProjectDetailPage() {
  const { projectId } = useParams();
  const [project, setProject] = useState<Project | null>(null);
  const [buildingDetails, setBuildingDetails] = useState<ProjectBuildingDetails | null>(null);
  const [buildingDialogOpen, setBuildingDialogOpen] = useState(false);
  const [statusDialogOpen, setStatusDialogOpen] = useState(false);
  const [statusDraft, setStatusDraft] = useState<ProjectStatus>("planning");
  const [savingStatus, setSavingStatus] = useState(false);
  const [statusError, setStatusError] = useState("");
  const [landDetails, setLandDetails] = useState<ProjectLand | null>(null);
  const [landTitle, setLandTitle] = useState("");
  const [landLocation, setLandLocation] = useState("");
  const [landDate, setLandDate] = useState("");
  const [landArea, setLandArea] = useState("");
  const [landAreaUnit, setLandAreaUnit] = useState<"marla" | "kanal" | "sqft" | "sqyd" | "acre">(
    "sqyd",
  );
  const [landSeller, setLandSeller] = useState("");
  const [landAccount, setLandAccount] = useState("");
  const [landPrice, setLandPrice] = useState("");
  const [landNotes, setLandNotes] = useState("");
  const [partners, setPartners] = useState<ProjectPartnerRow[]>([]);
  const [contributions, setContributions] = useState<Transaction[]>([]);
  const [partnerDialog, setPartnerDialog] = useState<ProjectPartnerRow | "new" | null>(null);
  const [selectedPartnerId, setSelectedPartnerId] = useState<string | null>(null);
  const [estimates, setEstimates] = useState<ProjectEstimate[]>([]);
  const [actualCosts, setActualCosts] = useState<Transaction[]>([]);
  const [constructionCosts, setConstructionCosts] = useState<Transaction[]>([]);
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
    Promise.all([
      getProjectById(projectId),
      getProjectBuildingDetails(projectId),
      listProjectEstimates(projectId),
      listActualProjectCosts(projectId),
      listConstructionCosts(projectId),
      listProjectPartners(projectId),
      listPartnerContributions(projectId),
      getProjectLand(projectId),
    ])
      .then(
        ([
          projectRow,
          buildingRow,
          estimateRows,
          costRows,
          constructionRows,
          partnerRows,
          contributionRows,
          landRow,
        ]) => {
          if (!active) return;
          setProject(projectRow);
          setBuildingDetails(buildingRow);
          setEstimates(estimateRows);
          setActualCosts(costRows);
          setConstructionCosts(constructionRows);
          setPartners(partnerRows);
          setContributions(contributionRows);
          setLandDetails(landRow);
        },
      )
      .catch((cause) => {
        if (active) setError(String(cause));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [projectId]);

  async function saveEstimate(value: EstimateInput) {
    if (editingEstimate) {
      const row = await updateProjectEstimate(editingEstimate.id, value);
      setEstimates((current) => current.map((item) => (item.id === row.id ? row : item)));
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

  async function saveConstruction(value: ActualCostInput) {
    const row = await addConstructionCost(value);
    setConstructionCosts((current) => [row, ...current]);
    setActualCosts((current) => [row, ...current]);
    toast.success("Construction cost recorded");
  }

  async function saveBuildingDetails(value: BuildingDetailsInput) {
    const row = await saveProjectBuildingDetails(value);
    setBuildingDetails(row);
    toast.success("Building details saved");
  }

  async function saveStatus() {
    if (!project) return;
    const land =
      statusDraft === "land acquired"
        ? LandAcquisitionSchema.safeParse({
            account_key: landPrice.trim() ? landAccount : undefined,
            title: landTitle,
            location: landLocation,
            purchase_date: landDate,
            area_value: landArea.trim() ? Number(landArea) : null,
            area_unit: landArea.trim() ? landAreaUnit : null,
            seller_name: landSeller,
            price: landPrice.trim() ? Number(landPrice.replace(/,/g, "")) : null,
            notes: landNotes,
          })
        : null;
    if (land && !land.success) {
      setStatusError(land.error.issues[0]?.message ?? "Check the land details.");
      return;
    }
    setSavingStatus(true);
    setStatusError("");
    try {
      const updated = land?.success
        ? await saveProjectStage(project.id, statusDraft, land.data)
        : await updateProjectStatus(project.id, statusDraft);
      setProject(updated);
      if (land?.success) {
        setLandDetails({ ...land.data, id: landDetails?.id ?? "" });
        setBuildingDetails(
          (current) =>
            current && {
              ...current,
              plot_area_value: land.data.area_value,
              plot_area_unit: land.data.area_unit,
            },
        );
      }
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
      listProjectPartners(id),
      listPartnerContributions(id),
    ]);
    setPartners(partnerRows);
    setContributions(contributionRows);
  }

  async function savePartner(value: AddProjectPartnerInput) {
    await addProjectPartner(value);
    toast.success("Partner added");
    try {
      await refreshPartners(value.project_id);
    } catch {
      toast.error("Partner saved. Refresh the page to see the latest details.");
    }
  }

  async function saveContribution(value: PartnerContributionInput) {
    await addPartnerContribution(value);
    toast.success("Partner contribution recorded");
    try {
      await refreshPartners(value.project_id);
    } catch {
      toast.error("Contribution saved. Refresh the page to see the latest details.");
    }
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
  const landCost = project ? landPurchaseCost(project.id, landDetails) : null;
  const allActualCosts = landCost
    ? [landCost, ...actualCosts].sort((a, b) => b.date.localeCompare(a.date))
    : actualCosts;
  const actualFilter = useRecordFilters(allActualCosts, {
    label: "actual costs",
    searchText: (item) => [item.description, item.reference].filter(Boolean).join(" "),
    date: (item) => item.date,
    amount: (item) => item.amount,
    facets: [
      {
        label: "Source",
        value: (item) =>
          item.type === "land_purchase"
            ? "Land acquired"
            : item.type === "construction_cost"
              ? "Construction Cost"
              : "Added here",
      },
      { label: "Payment method", value: (item) => item.method },
    ],
  });
  const partnerFilter = useRecordFilters(partners, {
    label: "project partners",
    searchText: (item) => [item.name, item.phone].filter(Boolean).join(" "),
    amount: (item) => item.contributed,
  });
  const paymentFilter = useRecordFilters(contributions, {
    label: "partner payments",
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
    facets: [{ label: "Method", value: (item) => item.method }],
  });
  const actualTotal = sum(allActualCosts.map((item) => item.amount));
  const visibleProjectTabs = projectTabs.filter(
    ({ id }) =>
      id !== "construction" ||
      project?.status === "under construction" ||
      project?.status === "completed" ||
      constructionCosts.length > 0,
  );
  const allocatedShareBp = sum(partners.map((item) => item.share_bp));
  const contributedTotal = sum(contributions.map((item) => item.amount));
  const selectedPartner =
    partners.find((item) => item.partnership_id === selectedPartnerId) ?? null;
  const selectedSpaces = buildingDetails
    ? decodeBuildingSpaces(buildingDetails.selected_spaces_json ?? "[]")
    : [];

  return (
    <div className="project-detail-page">
      {loading && <p className="py-8 text-sm text-muted-foreground">Loading project…</p>}
      {!loading && error && (
        <p role="alert" className="py-8 text-sm text-destructive">
          Could not load project: {error}
        </p>
      )}
      {!loading && !error && !project && (
        <p className="py-8 text-sm text-muted-foreground">Project not found.</p>
      )}
      {!loading && !error && project && (
        <>
          <section className="project-heading-card" aria-label="Project and status">
            <div className="project-heading-top">
              <div>
                <Link to="/projects" className="project-heading-back">
                  <ArrowLeft className="size-4" />
                  Back to Projects
                </Link>
                <div className="project-detail-title">
                  <span>
                    <Building2 size={30} />
                  </span>
                  <div>
                    <small>PROJECT WORKSPACE</small>
                    <h1>{project.name}</h1>
                  </div>
                </div>
                <p className="project-detail-location">
                  <MapPin size={16} />
                  {project.location || "No address"}
                </p>
              </div>
              <Button
                variant="outline"
                onClick={() => {
                  setStatusDraft(
                    ProjectStatuses.includes(project.status as ProjectStatus)
                      ? (project.status as ProjectStatus)
                      : "planning",
                  );
                  setStatusError("");
                  setLandTitle(landDetails?.title ?? project.name);
                  setLandLocation(landDetails?.location ?? project.location ?? "");
                  setLandDate(landDetails?.purchase_date ?? format(new Date(), "yyyy-MM-dd"));
                  setLandArea(landDetails?.area_value?.toString() ?? "");
                  setLandAreaUnit(landDetails?.area_unit ?? "sqyd");
                  setLandSeller(landDetails?.seller_name ?? "");
                  setLandPrice(landDetails?.price?.toString() ?? "");
                  setLandNotes(landDetails?.notes ?? "");
                  setLandAccount(landDetails?.account_key ?? "");
                  setStatusDialogOpen(true);
                }}
              >
                <Pencil className="size-4" />
                Change Status
              </Button>
            </div>
            <ProjectStatusProgress status={project.status} />
            {project.status === "land acquired" && !landDetails && (
              <p className="project-land-missing">
                Land details have not been added yet. Select Change Status to record the acquired
                land.
              </p>
            )}
            {landDetails && (
              <div className="project-land-summary">
                <Landmark size={18} />
                <div>
                  <strong>Land acquired: {landDetails.title}</strong>
                  <span>
                    {landDetails.location}
                    {landDetails.area_value
                      ? ` · ${landDetails.area_value} ${landDetails.area_unit}`
                      : ""}
                    {landDetails.price ? ` · ${formatPKR(landDetails.price)}` : ""}
                  </span>
                  <span>
                    Acquired {formatDate(landDetails.purchase_date)}
                    {landDetails.seller_name ? ` · Seller: ${landDetails.seller_name}` : ""}
                    {landDetails.notes ? ` · ${landDetails.notes}` : ""}
                  </span>
                </div>
              </div>
            )}
          </section>

          <div role="tablist" aria-label="Project details" className="project-detail-tabs">
            {visibleProjectTabs.map(({ id, label, icon: Icon }, index) => (
              <button
                key={id}
                id={`project-tab-${id}`}
                type="button"
                role="tab"
                aria-selected={tab === id}
                aria-controls={`project-panel-${id}`}
                tabIndex={tab === id ? 0 : -1}
                onClick={() => setTab(id)}
                onKeyDown={(event) => {
                  const next =
                    event.key === "ArrowRight"
                      ? (index + 1) % visibleProjectTabs.length
                      : event.key === "ArrowLeft"
                        ? (index - 1 + visibleProjectTabs.length) % visibleProjectTabs.length
                        : event.key === "Home"
                          ? 0
                          : event.key === "End"
                            ? visibleProjectTabs.length - 1
                            : -1;
                  if (next >= 0) {
                    event.preventDefault();
                    setTab(visibleProjectTabs[next].id);
                    document.getElementById(`project-tab-${visibleProjectTabs[next].id}`)?.focus();
                  }
                }}
              >
                <Icon size={19} aria-hidden="true" />
                {label}
              </button>
            ))}
          </div>

          {tab === "dashboard" && (
            <ProjectDashboard
              project={project}
              buildingDetails={buildingDetails}
              land={landDetails}
              partners={partners}
              contributions={contributions}
              estimates={estimates}
              actualCosts={allActualCosts}
            />
          )}

          {tab === "building" && (
            <section
              id="project-panel-building"
              role="tabpanel"
              aria-labelledby="project-tab-building"
              className="project-detail-section project-building-section mb-8 rounded-xl border bg-card p-5"
            >
              <div className="project-building-heading mb-4 flex flex-wrap items-center justify-between gap-3">
                <div className="project-building-heading-copy">
                  <span className="project-building-heading-icon">
                    <Building2 size={25} />
                  </span>
                  <div>
                    <h2 className="text-lg font-semibold">Building Details</h2>
                    <p className="text-sm text-muted-foreground">
                      Planned floors, units and areas for this project.
                    </p>
                  </div>
                </div>
                <Button variant="outline" onClick={() => setBuildingDialogOpen(true)}>
                  <Pencil className="size-4" />
                  {buildingDetails ? "Edit Details" : "Add Details"}
                </Button>
              </div>
              {buildingDetails ? (
                <>
                  <div
                    role="tablist"
                    aria-label="Building details"
                    className="building-detail-tabs"
                  >
                    {buildingTabs.map(({ id, label, icon: Icon }, index) => (
                      <button
                        key={id}
                        id={`building-tab-${id}`}
                        type="button"
                        role="tab"
                        aria-selected={buildingTab === id}
                        aria-controls={`building-panel-${id}`}
                        tabIndex={buildingTab === id ? 0 : -1}
                        onClick={() => setBuildingTab(id)}
                        onKeyDown={(event) => {
                          const next =
                            event.key === "ArrowRight"
                              ? (index + 1) % buildingTabs.length
                              : event.key === "ArrowLeft"
                                ? (index - 1 + buildingTabs.length) % buildingTabs.length
                                : event.key === "Home"
                                  ? 0
                                  : event.key === "End"
                                    ? buildingTabs.length - 1
                                    : -1;
                          if (next >= 0) {
                            event.preventDefault();
                            const target = buildingTabs[next].id;
                            setBuildingTab(target);
                            document.getElementById(`building-tab-${target}`)?.focus();
                          }
                        }}
                      >
                        <Icon size={19} aria-hidden="true" />
                        {label}
                      </button>
                    ))}
                  </div>
                  <p className="building-tab-description">
                    {buildingTabs.find((item) => item.id === buildingTab)?.description}
                  </p>
                  {buildingTab === "overview" && (
                    <div
                      id="building-panel-overview"
                      role="tabpanel"
                      aria-labelledby="building-tab-overview"
                      className="building-tab-panel"
                    >
                      <BuildingOverview details={buildingDetails} selectedSpaces={selectedSpaces} />
                    </div>
                  )}
                  {buildingTab === "floors" && (
                    <div
                      id="building-panel-floors"
                      role="tabpanel"
                      aria-labelledby="building-tab-floors"
                      className="building-tab-panel"
                    >
                      <BuildingFloorsOverview details={buildingDetails} />
                    </div>
                  )}
                  {buildingTab === "areas" && (
                    <div
                      id="building-panel-areas"
                      role="tabpanel"
                      aria-labelledby="building-tab-areas"
                      className="building-tab-panel"
                    >
                      <BuildingAreasOverview details={buildingDetails} land={landDetails} />
                    </div>
                  )}
                </>
              ) : landDetails ? (
                <div className="building-area-insight">
                  <BuildingAreaChart details={null} land={landDetails} />
                  <p className="text-sm text-muted-foreground">
                    Add building details to plan floors, flats and covered area.
                  </p>
                </div>
              ) : (
                <div className="project-building-empty">
                  <span>
                    <Building2 size={28} />
                  </span>
                  <h3>No building plan yet</h3>
                  <p>Add the building use, spaces and floors to see the project plan here.</p>
                  <Button type="button" onClick={() => setBuildingDialogOpen(true)}>
                    <Plus size={17} />
                    Add building details
                  </Button>
                </div>
              )}
            </section>
          )}

          {tab === "partners" && (
            <section
              id="project-panel-partners"
              role="tabpanel"
              aria-labelledby="project-tab-partners"
              className="project-partners-panel project-detail-section mb-8 rounded-xl border bg-card p-5"
            >
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold">Project Partners</h2>
                  <p className="text-sm text-muted-foreground">
                    Ownership shares and money received for this project.
                  </p>
                </div>
                <Button
                  onClick={() => setPartnerDialog("new")}
                  disabled={allocatedShareBp >= 10_000}
                >
                  <Plus className="size-4" />
                  Add Partner
                </Button>
              </div>
              <div className="partner-section-heading">
                <div>
                  <h3>Partner profiles</h3>
                  <p>Select a profile to see its full details and record a payment.</p>
                </div>
                <span>
                  {partners.length} {partners.length === 1 ? "partner" : "partners"}
                </span>
              </div>
              {partnerFilter.controls}
              {partners.length > 0 && partnerFilter.visible.length === 0 && (
                <p className="filter-empty">No partners match these filters.</p>
              )}
              {partners.length === 0 ? (
                <p className="rounded-lg border p-6 text-sm text-muted-foreground">
                  No partners added yet. Use Add Partner to create the first profile.
                </p>
              ) : (
                <div className="partner-cards">
                  {partnerFilter.visible.map((partner) => (
                    <article
                      key={partner.partnership_id}
                      className="partner-card rounded-lg border p-4"
                    >
                      <button
                        type="button"
                        className="partner-profile-toggle"
                        aria-label={`View ${partner.name}'s details`}
                        onClick={() => setSelectedPartnerId(partner.partnership_id)}
                      >
                        <span className="partner-profile-top">
                          <span className="partner-profile-avatar">
                            <UserRound size={24} />
                          </span>
                          <span className="partner-profile-main">
                            <strong>{partner.name}</strong>
                            <span>{partner.phone || "Phone not added"}</span>
                          </span>
                          <ChevronRight size={18} className="partner-chevron" />
                        </span>
                        <span
                          className="partner-card-chart"
                          role="img"
                          aria-label={`${partner.name} owns ${(partner.share_bp / 100).toFixed(2)} percent of this project`}
                          style={{
                            background: `conic-gradient(#d8a72f ${partner.share_bp / 100}%, var(--muted) 0)`,
                          }}
                        >
                          <span>
                            <strong>{(partner.share_bp / 100).toFixed(2)}%</strong>
                            <small>project share</small>
                          </span>
                        </span>
                        <span className="partner-profile-quick">
                          <span>
                            Received <strong>{formatPKR(partner.contributed)}</strong>
                          </span>
                          <span>
                            {partner.agreed_contribution === null
                              ? "No payment target set"
                              : `Remaining ${formatPKR(Math.max(0, partner.agreed_contribution - partner.contributed))}`}
                          </span>
                        </span>
                        {partner.agreed_contribution !== null && (
                          <span className="partner-card-payment-chart">
                            <span className="partner-card-payment-label">Payment progress</span>
                            <span
                              className="partner-funding-track"
                              role="img"
                              aria-label={`${partner.name}: ${formatPKR(partner.contributed)} received, ${formatPKR(Math.max(0, partner.agreed_contribution - partner.contributed))} remaining`}
                            >
                              <span
                                style={{
                                  width: `${partner.agreed_contribution > 0 ? Math.min(100, (partner.contributed / partner.agreed_contribution) * 100) : 100}%`,
                                }}
                              />
                            </span>
                          </span>
                        )}
                        <span className="partner-card-more">
                          View details <ChevronRight size={15} />
                        </span>
                      </button>
                    </article>
                  ))}
                </div>
              )}
              <div className="partner-overview-heading">
                <h3>Project picture</h3>
                <p>These charts combine the information from all partner profiles.</p>
              </div>
              <div className="mb-4 grid gap-3 sm:grid-cols-3">
                <Summary
                  title="Share assigned to partners"
                  value={`${(allocatedShareBp / 100).toFixed(2)}%`}
                />
                <Summary
                  title="Share still available"
                  value={`${((10_000 - allocatedShareBp) / 100).toFixed(2)}%`}
                />
                <Summary title="Money received so far" value={formatPKR(contributedTotal)} />
              </div>
              {partners.length > 0 && (
                <div className="partner-insight-grid">
                  <OwnershipChart partners={partners} />
                  <PartnerFundingChart partners={partners} />
                </div>
              )}
              {contributions.length > 0 && (
                <details open className="partner-payments">
                  <summary className="partner-payments-heading">
                    <h3>Payment history</h3>
                    <span>
                      {contributions.length} {contributions.length === 1 ? "payment" : "payments"}{" "}
                      <ChevronDown size={16} />
                    </span>
                  </summary>
                  {paymentFilter.controls}
                  <div className="partner-payment-list">
                    {paymentFilter.visible.map((item) => (
                      <article key={item.id} className="partner-payment">
                        <span className="partner-payment-dot" aria-hidden="true" />
                        <div className="partner-payment-main">
                          <strong>
                            {partners.find((partner) => partner.partner_id === item.partner_id)
                              ?.name ?? "Partner"}
                          </strong>
                          <p>{item.description || "Partner payment"}</p>
                          <small>
                            {formatDate(item.date)} · {item.method || "Method not set"}
                            {item.reference ? ` · ${item.reference}` : ""}
                          </small>
                          <PaymentDetailsView transaction={item} />
                        </div>
                        <strong className="partner-payment-amount">
                          + {formatPKR(item.amount)}
                        </strong>
                      </article>
                    ))}
                  </div>
                </details>
              )}
            </section>
          )}

          {tab === "estimate" && (
            <div id="project-panel-estimate" role="tabpanel" aria-labelledby="project-tab-estimate">
              <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold">Project estimate</h2>
                  <p className="text-sm text-muted-foreground">
                    Plan minimum and maximum costs and expected recovery.
                  </p>
                </div>
                <div className="estimate-actions">
                  <Button
                    onClick={() => {
                      setEditingEstimate(null);
                      setEstimateKind("cost");
                      setDialog("estimate");
                    }}
                  >
                    <Plus className="size-4" />
                    Add Expected Cost
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setEditingEstimate(null);
                      setEstimateKind("revenue");
                      setDialog("estimate");
                    }}
                  >
                    <Plus className="size-4" />
                    Add Expected Recovery
                  </Button>
                </div>
              </div>
              <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                <Summary
                  title="Estimated costs"
                  value={`${formatPKR(costMin)} – ${formatPKR(costMax)}`}
                />
                <Summary
                  title="Expected recovery"
                  value={`${formatPKR(revenueMin)} – ${formatPKR(revenueMax)}`}
                />
                <Summary
                  title="Projected margin range"
                  value={
                    revenues.length
                      ? `${formatPKR(revenueMin - costMax)} – ${formatPKR(revenueMax - costMin)}`
                      : "Add recovery items"
                  }
                />
              </div>
              <div className="project-insight-grid">
                <EstimateChart items={costs} title="Estimated cost breakdown" />
                <EstimateChart items={revenues} title="Expected recovery breakdown" />
              </div>
              <EstimateSection
                title="Cost items"
                items={costs}
                onDelete={setItemToDelete}
                onEdit={(item) => {
                  setEditingEstimate(item);
                  setEstimateKind("cost");
                  setDialog("estimate");
                }}
              />
              <EstimateSection
                title="Recovery / revenue items"
                items={revenues}
                onDelete={setItemToDelete}
                onEdit={(item) => {
                  setEditingEstimate(item);
                  setEstimateKind("revenue");
                  setDialog("estimate");
                }}
              />
            </div>
          )}
          {tab === "actual" && (
            <div id="project-panel-actual" role="tabpanel" aria-labelledby="project-tab-actual">
              <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold">Actual project costs</h2>
                  <p className="text-sm text-muted-foreground">
                    Land purchase and construction payments appear here automatically. Add other
                    project costs below.
                  </p>
                </div>
                <Button onClick={() => setDialog("actual")}>
                  <Plus className="size-4" />
                  Add Actual Cost
                </Button>
              </div>
              <div className="mb-6 grid gap-3 sm:grid-cols-2">
                <Summary title="Total spent" value={formatPKR(actualTotal)} />
                <Summary
                  title="Estimated cost range"
                  value={`${formatPKR(costMin)} – ${formatPKR(costMax)}`}
                />
              </div>
              <SpendingChart costs={actualFilter.visible} />
              {actualFilter.controls}
              <p className="scope-note">
                Project totals above include all costs. The chart and table use your filters.
                Matching total: {formatPKR(sum(actualFilter.visible.map((item) => item.amount)))}
              </p>
              {allActualCosts.length > 0 && actualFilter.visible.length === 0 && (
                <p className="filter-empty">No costs match these filters.</p>
              )}
              {allActualCosts.length === 0 ? (
                <p className="rounded-lg border p-8 text-center text-sm text-muted-foreground">
                  No actual costs recorded yet.
                </p>
              ) : (
                <div className="overflow-x-auto rounded-lg border">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50 text-left text-muted-foreground">
                      <tr>
                        <th className="px-4 py-3 font-medium">Date</th>
                        <th className="px-4 py-3 font-medium">Description</th>
                        <th className="px-4 py-3 font-medium">Source</th>
                        <th className="px-4 py-3 font-medium">Method</th>
                        <th className="px-4 py-3 text-right font-medium">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {actualFilter.visible.map((item) => (
                        <tr key={item.id} className="border-t">
                          <td className="px-4 py-3">{formatDate(item.date)}</td>
                          <td className="px-4 py-3">
                            {item.description}
                            {item.reference && (
                              <span className="block text-xs text-muted-foreground">
                                Ref: {item.reference}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            {item.type === "land_purchase"
                              ? "Land acquired"
                              : item.type === "construction_cost"
                                ? "Construction Cost"
                                : "Added here"}
                          </td>
                          <td className="px-4 py-3 capitalize">{item.method || "—"}</td>
                          <td className="px-4 py-3 text-right font-medium">
                            {formatPKR(item.amount)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
          {tab === "construction" && (
            <div
              id="project-panel-construction"
              role="tabpanel"
              aria-labelledby="project-tab-construction"
              className="construction-cost-section"
            >
              <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold">Construction costs</h2>
                  <p className="text-sm text-muted-foreground">
                    Record materials, labour and other building payments here. They also count
                    toward Actual Cost.
                  </p>
                </div>
                <Button onClick={() => setDialog("construction")}>
                  <Plus className="size-4" />
                  Add Construction Cost
                </Button>
              </div>
              <ConstructionCostInsights costs={constructionCosts} />
            </div>
          )}
          {dialog && (
            <ProjectEntryDialog
              mode={dialog === "estimate" ? "estimate" : "actual"}
              projectId={project.id}
              estimate={editingEstimate}
              estimateKind={estimateKind}
              buildingDetails={buildingDetails}
              recoveryEstimates={revenues}
              onOpenChange={(open) => {
                if (!open) {
                  setDialog(null);
                  setEditingEstimate(null);
                }
              }}
              onEstimate={saveEstimate}
              onActual={dialog === "construction" ? saveConstruction : saveActual}
              actualTitle={dialog === "construction" ? "Add Construction Cost" : "Add Actual Cost"}
            />
          )}
          {buildingDialogOpen && (
            <BuildingDetailsDialog
              projectId={project.id}
              details={buildingDetails}
              onOpenChange={setBuildingDialogOpen}
              onSubmit={saveBuildingDetails}
            />
          )}
          <Dialog
            open={statusDialogOpen}
            onOpenChange={(open) => {
              if (!savingStatus) setStatusDialogOpen(open);
            }}
          >
            <DialogContent className="project-stage-dialog project-stage-redesign max-h-[90vh] overflow-y-auto sm:max-w-xl">
              <DialogHeader>
                <span className="project-modal-icon">
                  <Building2 size={26} />
                </span>
                <DialogTitle>Change project status</DialogTitle>
                <p className="text-sm text-muted-foreground">
                  Choose the stage that best describes this project now.
                </p>
              </DialogHeader>
              <div className="project-stage-preview">
                <ProjectStatusProgress status={statusDraft} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="project-update-status">Project status</Label>
                <select
                  id="project-update-status"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={statusDraft}
                  onChange={(event) => setStatusDraft(event.target.value as ProjectStatus)}
                >
                  {ProjectStatuses.map((status) => (
                    <option key={status} value={status}>
                      {status.charAt(0).toUpperCase() + status.slice(1)}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground">
                  The new status will also appear on the Projects page.
                </p>
              </div>
              {statusDraft === "land acquired" && (
                <div className="project-stage-fields">
                  <div className="project-stage-intro">
                    <Landmark size={20} />
                    <div>
                      <strong>Tell us about the land</strong>
                      <p>
                        These details will stay with this project so you can see what was acquired.
                      </p>
                    </div>
                  </div>
                  <div className="project-stage-grid">
                    <div>
                      <Label htmlFor="stage-land-title">Land name *</Label>
                      <input
                        id="stage-land-title"
                        value={landTitle}
                        onChange={(event) => setLandTitle(event.target.value)}
                        placeholder="e.g. Baloch Residency plot"
                      />
                    </div>
                    <div>
                      <Label htmlFor="stage-land-date">Date acquired *</Label>
                      <input
                        id="stage-land-date"
                        type="date"
                        value={landDate}
                        onChange={(event) => setLandDate(event.target.value)}
                      />
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="stage-land-location">Land location *</Label>
                    <input
                      id="stage-land-location"
                      value={landLocation}
                      onChange={(event) => setLandLocation(event.target.value)}
                      placeholder="Address or area"
                    />
                  </div>
                  <div className="project-stage-grid">
                    <div>
                      <Label htmlFor="stage-land-area">Area (optional)</Label>
                      <input
                        id="stage-land-area"
                        type="number"
                        min="0"
                        step="any"
                        value={landArea}
                        onChange={(event) => setLandArea(event.target.value)}
                        placeholder="e.g. 7000"
                      />
                    </div>
                    <div>
                      <Label htmlFor="stage-land-unit">Area unit</Label>
                      <select
                        id="stage-land-unit"
                        value={landAreaUnit}
                        onChange={(event) =>
                          setLandAreaUnit(event.target.value as typeof landAreaUnit)
                        }
                      >
                        <option value="sqyd">Square yards</option>
                        <option value="sqft">Square feet</option>
                        <option value="marla">Marla</option>
                        <option value="kanal">Kanal</option>
                        <option value="acre">Acre</option>
                      </select>
                    </div>
                  </div>
                  <div className="project-stage-grid">
                    <div>
                      <Label htmlFor="stage-land-seller">Seller (optional)</Label>
                      <input
                        id="stage-land-seller"
                        value={landSeller}
                        onChange={(event) => setLandSeller(event.target.value)}
                        placeholder="Person or company"
                      />
                    </div>
                    <div>
                      <Label htmlFor="stage-land-price">Purchase price in Rs (optional)</Label>
                      <input
                        id="stage-land-price"
                        inputMode="numeric"
                        value={landPrice}
                        onChange={(event) => setLandPrice(event.target.value)}
                        placeholder="e.g. 5,000,000"
                      />
                    </div>
                  </div>
                  <div>
                    {landPrice.trim() && (
                      <BankAccountSelect value={landAccount} onChange={setLandAccount} />
                    )}
                    <Label htmlFor="stage-land-notes">Notes (optional)</Label>
                    <textarea
                      id="stage-land-notes"
                      value={landNotes}
                      onChange={(event) => setLandNotes(event.target.value)}
                      rows={2}
                      placeholder="Any useful detail about this land"
                    />
                  </div>
                </div>
              )}
              {statusDraft === "under construction" && (
                <p className="project-stage-hint">
                  Construction payments can be added in the Construction Cost tab after you save
                  this status.
                </p>
              )}
              {statusError && (
                <p role="alert" className="text-sm text-destructive">
                  {statusError}
                </p>
              )}
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  disabled={savingStatus}
                  onClick={() => setStatusDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  disabled={
                    savingStatus ||
                    (statusDraft === project.status && statusDraft !== "land acquired")
                  }
                  onClick={saveStatus}
                >
                  {savingStatus
                    ? "Saving…"
                    : statusDraft === "land acquired"
                      ? "Save land and status"
                      : "Save status"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <Dialog
            open={!!selectedPartner}
            onOpenChange={(open) => {
              if (!open) setSelectedPartnerId(null);
            }}
          >
            <DialogContent className="partner-dialog partner-profile-modal max-h-[90vh] overflow-y-auto sm:max-w-xl">
              {selectedPartner && (
                <>
                  <DialogHeader>
                    <DialogTitle className="flex items-center gap-3">
                      <span className="partner-profile-avatar">
                        <UserRound size={23} />
                      </span>
                      <span>{selectedPartner.name}</span>
                    </DialogTitle>
                  </DialogHeader>
                  <p className="text-sm text-muted-foreground">
                    {(selectedPartner.share_bp / 100).toFixed(2)}% share in this project
                  </p>
                  <div className="partner-modal-facts">
                    <p>
                      <span>Phone</span>
                      <strong>{selectedPartner.phone || "Not added"}</strong>
                    </p>
                    {selectedPartner.phone2 && (
                      <p>
                        <span>Other phone</span>
                        <strong>{selectedPartner.phone2}</strong>
                      </p>
                    )}
                    {selectedPartner.address && (
                      <p>
                        <span>Address</span>
                        <strong>{selectedPartner.address}</strong>
                      </p>
                    )}
                    {selectedPartner.notes && (
                      <p>
                        <span>Notes</span>
                        <strong>{selectedPartner.notes}</strong>
                      </p>
                    )}
                  </div>
                  <div className="partner-modal-money">
                    <div>
                      <span>Agreed contribution</span>
                      <strong>
                        {selectedPartner.agreed_contribution === null
                          ? "Not set"
                          : formatPKR(selectedPartner.agreed_contribution)}
                      </strong>
                    </div>
                    <div>
                      <span>Money received</span>
                      <strong>{formatPKR(selectedPartner.contributed)}</strong>
                    </div>
                    <div>
                      <span>Still to receive</span>
                      <strong>
                        {selectedPartner.agreed_contribution === null
                          ? "Unknown"
                          : formatPKR(
                              Math.max(
                                0,
                                selectedPartner.agreed_contribution - selectedPartner.contributed,
                              ),
                            )}
                      </strong>
                    </div>
                  </div>
                  {selectedPartner.agreed_contribution !== null ? (
                    <div className="partner-card-progress">
                      <div
                        className="partner-funding-track"
                        role="img"
                        aria-label={`${selectedPartner.name}: ${formatPKR(selectedPartner.contributed)} received, ${formatPKR(Math.max(0, selectedPartner.agreed_contribution - selectedPartner.contributed))} remaining`}
                      >
                        <div
                          style={{
                            width: `${selectedPartner.agreed_contribution > 0 ? Math.min(100, (selectedPartner.contributed / selectedPartner.agreed_contribution) * 100) : 100}%`,
                          }}
                        />
                      </div>
                      <span>
                        {selectedPartner.contributed < selectedPartner.agreed_contribution
                          ? `${formatPKR(selectedPartner.agreed_contribution - selectedPartner.contributed)} remaining`
                          : selectedPartner.contributed > selectedPartner.agreed_contribution
                            ? "Above agreed amount"
                            : "Fully received"}
                      </span>
                    </div>
                  ) : (
                    <p className="partner-no-agreement">
                      No agreed amount was saved, so a remaining balance cannot be calculated.
                    </p>
                  )}
                  {contributions.some((item) => item.partner_id === selectedPartner.partner_id) && (
                    <div className="partner-modal-payments">
                      <h3>Payments from {selectedPartner.name}</h3>
                      {contributions
                        .filter((item) => item.partner_id === selectedPartner.partner_id)
                        .map((item) => (
                          <div key={item.id} className="partner-modal-payment">
                            <span>
                              {formatDate(item.date)}
                              <small>{item.description || "Partner payment"}</small>
                              <PaymentDetailsView transaction={item} />
                            </span>
                            <strong>{formatPKR(item.amount)}</strong>
                          </div>
                        ))}
                    </div>
                  )}
                  <DialogFooter>
                    <Button
                      type="button"
                      onClick={() => {
                        setPartnerDialog(selectedPartner);
                        setSelectedPartnerId(null);
                      }}
                    >
                      <Plus className="size-4" />
                      Record Payment
                    </Button>
                  </DialogFooter>
                </>
              )}
            </DialogContent>
          </Dialog>
          {partnerDialog && (
            <ProjectPartnerDialog
              projectId={project.id}
              partner={partnerDialog === "new" ? undefined : partnerDialog}
              remainingShareBp={10_000 - allocatedShareBp}
              onOpenChange={(open) => {
                if (!open) setPartnerDialog(null);
              }}
              onAddPartner={savePartner}
              onContribution={saveContribution}
            />
          )}
          <Dialog
            open={!!itemToDelete}
            onOpenChange={(open) => {
              if (!open && !deleting) closeDeleteDialog();
            }}
          >
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Delete estimate item?</DialogTitle>
              </DialogHeader>
              <p className="text-sm text-muted-foreground">
                {itemToDelete?.title} will be removed from this estimate and its totals.
              </p>
              {deleteError && (
                <p role="alert" className="text-sm text-destructive">
                  {deleteError}
                </p>
              )}
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  disabled={deleting}
                  onClick={closeDeleteDialog}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  disabled={deleting}
                  onClick={deleteEstimate}
                >
                  {deleting ? "Deleting…" : "Delete item"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      )}
    </div>
  );
}

function Summary({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <p className="text-sm text-muted-foreground">{title}</p>
      <p className="mt-2 text-lg font-semibold">{value}</p>
    </div>
  );
}

function EstimateSection({
  title,
  items,
  onEdit,
  onDelete,
}: {
  title: string;
  items: ProjectEstimate[];
  onEdit: (item: ProjectEstimate) => void;
  onDelete: (item: ProjectEstimate) => void;
}) {
  const { visible, controls } = useRecordFilters(items, {
    label: title.toLowerCase(),
    searchText: (item) => [item.title, item.details].filter(Boolean).join(" "),
    amount: (item) => item.maximum_amount,
  });
  return (
    <section className="mb-6">
      <h3 className="mb-3 font-semibold">{title}</h3>
      {controls}
      <p className="scope-note">Amount filters and sorting use the maximum estimate.</p>
      {items.length > 0 && visible.length === 0 && (
        <p className="filter-empty">No estimate items match these filters.</p>
      )}
      {items.length === 0 ? (
        <p className="rounded-lg border p-6 text-sm text-muted-foreground">No items added yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Item</th>
                <th className="px-4 py-3 text-right font-medium">Minimum</th>
                <th className="px-4 py-3 text-right font-medium">Maximum</th>
                <th className="px-4 py-3">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {visible.map((item) => (
                <tr key={item.id} className="border-t">
                  <td className="px-4 py-3">
                    <span className="font-medium">{item.title}</span>
                    {recoveryLink(item) && (
                      <span className="block text-xs text-muted-foreground">
                        {recoveryLink(item)!.quantity} planned {recoveryLink(item)!.space} ×
                        expected price per unit
                      </span>
                    )}
                    {flatRecoveryLines(item).map((line) => (
                      <span
                        className="block text-xs text-muted-foreground"
                        key={`${line.floor_index}-${line.rooms}`}
                      >
                        {line.floor_index === 0 ? "Ground" : `Floor ${line.floor_index}`}:{" "}
                        {line.quantity} × {line.rooms}-room flats at{" "}
                        {formatPKR(line.minimum_unit_price)} – {formatPKR(line.maximum_unit_price)}{" "}
                        each
                      </span>
                    ))}
                    {item.details && (
                      <span className="block text-xs text-muted-foreground">{item.details}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">{formatPKR(item.minimum_amount)}</td>
                  <td className="px-4 py-3 text-right">{formatPKR(item.maximum_amount)}</td>
                  <td className="px-4 py-3 text-right">
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      aria-label={`Edit ${item.title}`}
                      onClick={() => onEdit(item)}
                    >
                      <Pencil className="size-4" />
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      aria-label={`Delete ${item.title}`}
                      onClick={() => onDelete(item)}
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
