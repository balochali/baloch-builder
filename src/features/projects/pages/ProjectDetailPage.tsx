import { BankAccountSelect } from "@/components/BankAccountSelect";
import { listProjectCostDocuments, saveActualCostBill, saveActualCostReceipt, saveConstructionCostReceipt, saveConstructionSupplierBill, saveLandImage, saveLandPaymentReceipt, type DocumentRecord } from "@/data/repositories/documentsRepository";
import { SavedImageGallery, SelectedImagePreviews } from "@/features/documents/components/ImageGallery";
import "./project-detail.css";
import "./project-estimate.css";
import "./project-actual.css";
import "./project-construction.css";
import "./project-partners.css";
import { useEffect, useState } from "react";
import { format } from "date-fns";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  CircleCheck,
  ChevronDown,
  Landmark,
  Layers,
  Pencil,
  PieChart,
  Ruler,
  Trash2,
  UserRound,
  Plus,
  LayoutDashboard,
  Users,
  Calculator,
  Wallet,
  HardHat,
  Store,
  MapPin,
  SlidersHorizontal,
  Clock3,
  HandCoins,
  FolderOpen,
  Upload,
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
  emptyLandPaymentDetails,
  type LandPaymentDetails,
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
import { formatPKR, formatPKRInLakhCrore } from "@/domain/money";
import { formatDate } from "@/lib/dates";
import { ProjectEntryDialog } from "@/features/projects/components/ProjectEntryDialog";
import { flatRecoveryLines, recoveryLink } from "@/features/projects/components/recoverySpaces";
import { BuildingDetailsDialog } from "@/features/projects/components/BuildingDetailsDialog";
import { BuildingOverview } from "@/features/projects/components/BuildingOverview";
import { BuildingFloorsOverview } from "@/features/projects/components/BuildingFloorsOverview";
import { BuildingAreasOverview } from "@/features/projects/components/BuildingAreasOverview";
import { ProjectPartnerOverview } from "@/features/projects/components/ProjectPartnerOverview";
import { ProjectDashboard } from "@/features/projects/components/ProjectDashboard";
import { ConstructionCostInsights } from "@/features/projects/components/ConstructionCostInsights";
import { ProjectStatusProgress } from "@/features/projects/components/ProjectStatusProgress";
import { ProjectPartnerDialog } from "@/features/projects/components/ProjectPartnerDialog";
import { ProjectSalesPanel } from "@/features/projects/components/ProjectSalesPanel";
import { ProjectProfitLossPanel } from "@/features/projects/components/ProjectProfitLossPanel";
import { PaymentDetailsView } from "@/features/partners/components/PaymentDetailsView";
import {
  BuildingAreaChart,
  EstimateChart,
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
  type UpdateProjectPartnerInput,
  updateProjectPartner,
} from "@/data/repositories/projectPartnersRepository";

type Tab = "dashboard" | "building" | "partners" | "estimate" | "costs" | "sales" | "profit";
type BuildingTab = "overview" | "floors" | "areas";
type EntryMode = "estimate" | "actual" | "construction";
const projectTabs: { id: Tab; label: string; icon: LucideIcon }[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "building", label: "Building", icon: Building2 },
  { id: "partners", label: "Partners", icon: Users },
  { id: "estimate", label: "Estimate", icon: Calculator },
  { id: "costs", label: "Costs", icon: Wallet },
  { id: "sales", label: "Sales", icon: Store },
  { id: "profit", label: "Profit & Loss", icon: PieChart },
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
    method: land.payment_details?.method ?? null,
    reference: land.payment_details?.reference || null,
    description: `Land purchase: ${land.title}`,
    project_id: projectId,
    land_id: land.id || null,
    partner_id: null,
    contact_id: null,
    receipt_document_id: null,
    created_at: land.purchase_date,
    updated_at: land.purchase_date,
    archived: 0,
    custom: JSON.stringify({ payment_details: land.payment_details ?? null }),
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
  const [landPaymentDetails, setLandPaymentDetails] = useState<LandPaymentDetails>({
    ...emptyLandPaymentDetails,
  });
  const [landStep, setLandStep] = useState(0);
  const [landImages, setLandImages] = useState<File[]>([]);
  const [landPaymentImages, setLandPaymentImages] = useState<File[]>([]);
  const [landPrice, setLandPrice] = useState("");
  const [landNotes, setLandNotes] = useState("");
  const [partners, setPartners] = useState<ProjectPartnerRow[]>([]);
  const [contributions, setContributions] = useState<Transaction[]>([]);
  const [partnerDialog, setPartnerDialog] = useState<ProjectPartnerRow | "new" | null>(null);
  const [editingPartner, setEditingPartner] = useState<ProjectPartnerRow | null>(null);
  const [selectedPartnerId, setSelectedPartnerId] = useState<string | null>(null);
  const [estimates, setEstimates] = useState<ProjectEstimate[]>([]);
  const [actualCosts, setActualCosts] = useState<Transaction[]>([]);
  const [constructionCosts, setConstructionCosts] = useState<Transaction[]>([]);
  const [constructionDetailsOpen, setConstructionDetailsOpen] = useState(false);
  const [costDocuments, setCostDocuments] = useState<DocumentRecord[]>([]);
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
      listProjectCostDocuments(projectId),
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
          receiptRows,
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
          setCostDocuments(receiptRows);
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

  async function saveActual(value: ActualCostInput, documents: { transactionReceipts: File[]; supplierBills: File[] } = { transactionReceipts: [], supplierBills: [] }) {
    const row = await addActualProjectCost(value);
    setActualCosts((current) => [row, ...current]);
    toast.success("Actual cost recorded");
    const uploads = [
      ...documents.transactionReceipts.map((file) => saveActualCostReceipt(row.id, file, value.date, value.method)),
      ...documents.supplierBills.map((file) => saveActualCostBill(row.id, file, value.date)),
    ];
    if (uploads.length) {
      const results = await Promise.allSettled(uploads);
      const saved = results.flatMap((result) => result.status === "fulfilled" ? [result.value] : []);
      setCostDocuments((current) => [...saved, ...current]);
      const failures = results.length - saved.length;
      if (failures) toast.error(`${failures} document image${failures === 1 ? "" : "s"} could not be saved.`);
      else toast.success(`${saved.length} document image${saved.length === 1 ? "" : "s"} saved`);
    }
  }

  async function saveConstruction(value: ActualCostInput, documents: { transactionReceipts: File[]; supplierBills: File[] } = { transactionReceipts: [], supplierBills: [] }) {
    const row = await addConstructionCost(value);
    setConstructionCosts((current) => [row, ...current]);
    setActualCosts((current) => [row, ...current]);
    toast.success("Construction cost recorded");
    const uploads = [
      ...documents.transactionReceipts.map((file) => saveConstructionCostReceipt(row.id, file, value.date, value.method)),
      ...documents.supplierBills.map((file) => saveConstructionSupplierBill(row.id, file, value.date)),
    ];
    if (uploads.length) {
      const results = await Promise.allSettled(uploads);
      const saved = results.flatMap((result) => result.status === "fulfilled" ? [result.value] : []);
      setCostDocuments((current) => [...saved, ...current]);
      const failures = results.length - saved.length;
      if (failures) toast.error(`${failures} document image${failures === 1 ? "" : "s"} could not be saved.`);
      else toast.success(`${saved.length} document image${saved.length === 1 ? "" : "s"} saved`);
    }
  }

  async function saveBuildingDetails(value: BuildingDetailsInput) {
    const row = await saveProjectBuildingDetails(value);
    setBuildingDetails(row);
    toast.success("Building details saved");
  }

  function landDraft() {
    return {
      account_key: landPrice.trim() ? landAccount : undefined,
      title: landTitle,
      location: landLocation,
      purchase_date: landDate,
      area_value: landArea.trim() ? Number(landArea) : null,
      area_unit: landArea.trim() ? landAreaUnit : null,
      seller_name: landSeller,
      price: landPrice.trim() ? Number(landPrice.replace(/,/g, "")) : null,
      payment_details: landPrice.trim() ? landPaymentDetails : null,
      notes: landNotes,
    };
  }

  function nextLandStep() {
    setStatusError("");
    const result = LandAcquisitionSchema.safeParse(landDraft());
    if (landStep === 0) {
      const issue =
        !result.success &&
        result.error.issues.find(
          (item) => !["account_key", "payment_details"].includes(String(item.path[0])),
        );
      if (issue) {
        setStatusError(issue.message);
        return;
      }
    }
    if (landStep === 1 && !result.success) {
      setStatusError(result.error.issues[0]?.message ?? "Check the payment details.");
      return;
    }
    setLandStep((step) => Math.min(2, step + 1));
  }

  async function saveStatus() {
    if (!project) return;
    const land =
      statusDraft === "land acquired" ? LandAcquisitionSchema.safeParse(landDraft()) : null;
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
      let savedLand: ProjectLand | null = null;
      if (land?.success) {
        try {
          savedLand = await getProjectLand(project.id);
        } catch {
          /* Status is already saved. */
        }
        setLandDetails({ ...land.data, id: savedLand?.id ?? landDetails?.id ?? "" });
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
      if (land?.success && landImages.length) {
        if (!savedLand?.id)
          toast.error("Land saved, but its images could not be linked to Documents.");
        else {
          const results = await Promise.allSettled(
            landImages.map((file) => saveLandImage(savedLand.id, file, land.data.purchase_date)),
          );
          const failures = results.filter((result) => result.status === "rejected").length;
          if (failures)
            toast.error(
              `Land saved, but ${failures} image${failures === 1 ? "" : "s"} could not be attached.`,
            );
          else
            toast.success(
              `${landImages.length} image${landImages.length === 1 ? "" : "s"} saved to Documents`,
            );
        }
      }
      if (land?.success && landPaymentImages.length) {
        if (!savedLand?.id)
          toast.error("Land saved, but its payment images could not be linked to Documents.");
        else {
          const results = await Promise.allSettled(
            landPaymentImages.map((file) =>
              saveLandPaymentReceipt(
                savedLand.id,
                file,
                land.data.purchase_date,
                land.data.payment_details?.method ?? "other",
              ),
            ),
          );
          const failures = results.filter((result) => result.status === "rejected").length;
          if (failures)
            toast.error(
              `Land saved, but ${failures} payment image${failures === 1 ? "" : "s"} could not be attached.`,
            );
          else
            toast.success(
              `${landPaymentImages.length} payment image${landPaymentImages.length === 1 ? "" : "s"} saved to Documents`,
            );
        }
      }
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

  async function savePartnerUpdate(value: UpdateProjectPartnerInput) {
    const updated = await updateProjectPartner(value);
    setPartners((current) =>
      current.map((item) => (item.partnership_id === updated.partnership_id ? updated : item)),
    );
    toast.success("Partner updated");
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
  const actualSources = [
    { key: "land", label: "Land purchase", icon: Landmark, amount: sum(allActualCosts.filter((item) => item.type === "land_purchase").map((item) => item.amount)) },
    { key: "construction", label: "Construction", icon: HardHat, amount: sum(allActualCosts.filter((item) => item.type === "construction_cost").map((item) => item.amount)) },
    { key: "other", label: "Other project costs", icon: Wallet, amount: sum(allActualCosts.filter((item) => item.type !== "land_purchase" && item.type !== "construction_cost").map((item) => item.amount)) },
  ];
  const visibleProjectTabs = projectTabs;
  const allocatedShareBp = sum(partners.map((item) => item.share_bp));
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
                  setLandPaymentDetails(
                    landDetails?.payment_details ?? {
                      ...emptyLandPaymentDetails,
                      paid_to: landDetails?.seller_name ?? "",
                    },
                  );
                  setLandStep(0);
                  setLandImages([]);
                  setLandPaymentImages([]);
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
              <div className="project-partners-header">
                <div className="project-partners-heading-copy">
                  <span>
                    <Users size={25} aria-hidden="true" />
                  </span>
                  <div>
                    <h2 className="text-lg font-semibold">Project Partners</h2>
                    <p className="text-sm text-muted-foreground">
                      Ownership shares and money received for this project.
                    </p>
                  </div>
                </div>
                <Button
                  onClick={() => setPartnerDialog("new")}
                  disabled={allocatedShareBp >= 10_000}
                >
                  <Plus className="size-4" />
                  Add Partner
                </Button>
              </div>
              <ProjectPartnerOverview partners={partners} />
              <div className="partner-section-heading">
                <div>
                  <h3>Partner profiles</h3>
                  <p>Select a profile to see its full details and record a payment.</p>
                </div>
                <span>
                  {partners.length} {partners.length === 1 ? "partner" : "partners"}
                </span>
              </div>
              <details className="project-partner-filter-drawer">
                <summary>
                  <span>
                    <SlidersHorizontal size={18} /> Search & filter partners
                  </span>
                  <span>
                    {partnerFilter.active ? "Filters applied" : "All partners"}
                    <ChevronDown size={16} />
                  </span>
                </summary>
                {partnerFilter.controls}
              </details>
              {partnerFilter.active && (
                <div className="project-partner-active-filters">
                  <span>{partnerFilter.visible.length} partners match your filters.</span>
                  <Button variant="ghost" size="sm" onClick={partnerFilter.reset}>
                    Clear filters
                  </Button>
                </div>
              )}
              {partners.length > 0 && partnerFilter.visible.length === 0 && (
                <p className="filter-empty">No partners match these filters.</p>
              )}
              {partners.length === 0 ? (
                <div className="project-partners-empty">
                  <span>
                    <Users size={27} aria-hidden="true" />
                  </span>
                  <h3>No partners added yet</h3>
                  <p>
                    Add the first partner to track ownership shares and money received for this
                    project.
                  </p>
                </div>
              ) : (
                <div className="partner-cards">
                  {partnerFilter.visible.map((partner) => {
                    const agreed = partner.agreed_contribution;
                    const remaining =
                      agreed === null ? null : Math.max(0, agreed - partner.contributed);
                    const percent =
                      agreed && agreed > 0
                        ? Math.min(100, (partner.contributed / agreed) * 100)
                        : agreed === 0
                          ? 100
                          : 0;
                    const status =
                      agreed === null
                        ? "no-target"
                        : remaining === 0
                          ? "settled"
                          : partner.contributed > 0
                            ? "partial"
                            : "unpaid";
                    return (
                      <article key={partner.partnership_id} className={`partner-card is-${status}`}>
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
                            <ArrowRight size={19} className="partner-chevron" />
                          </span>
                          <span className="project-partner-card-status">
                            {status === "settled" ? (
                              <CircleCheck size={15} />
                            ) : status === "partial" ? (
                              <HandCoins size={15} />
                            ) : (
                              <Clock3 size={15} />
                            )}
                            {status === "settled"
                              ? "Contribution received"
                              : status === "partial"
                                ? "Partly received"
                                : status === "no-target"
                                  ? "No amount agreed"
                                  : "Awaiting payment"}
                          </span>
                          <span
                            className="project-partner-card-share"
                            role="img"
                            aria-label={`${partner.name} owns ${(partner.share_bp / 100).toFixed(2)} percent of this project`}
                          >
                            <span>
                              <PieChart size={18} aria-hidden="true" />
                              Project share
                            </span>
                            <strong>{(partner.share_bp / 100).toFixed(2)}%</strong>
                          </span>
                          <span className="project-partner-card-balance">
                            <small>
                              {remaining === null ? "Received so far" : "Still to receive"}
                            </small>
                            <strong>
                              {formatPKRInLakhCrore(remaining ?? partner.contributed)}
                            </strong>
                            {(remaining ?? partner.contributed) >= 100_000 && (
                              <em>
                                {formatPKR(remaining ?? partner.contributed, { lakhCrore: true })}{" "}
                                exactly
                              </em>
                            )}
                          </span>
                          {agreed !== null && (
                            <span className="project-partner-card-progress-caption">
                              <span>Contribution progress</span>
                              <strong>{Math.round(percent)}% received</strong>
                            </span>
                          )}
                          {agreed !== null && (
                            <span
                              className="partner-funding-track"
                              role="img"
                              aria-label={`${partner.name}: ${formatPKR(partner.contributed)} received, ${formatPKR(remaining ?? 0)} remaining`}
                            >
                              <span style={{ width: `${percent}%` }} />
                            </span>
                          )}
                          <span className="project-partner-card-money">
                            <span>
                              <small>Agreed</small>
                              <strong>
                                {partner.agreed_contribution === null
                                  ? "Not set"
                                  : formatPKR(partner.agreed_contribution)}
                              </strong>
                            </span>
                            <span>
                              <small>Received</small>
                              <strong>{formatPKR(partner.contributed)}</strong>
                            </span>
                          </span>
                          <span className="partner-card-more">
                            View details <ArrowRight size={15} />
                          </span>
                        </button>
                      </article>
                    );
                  })}
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
                            {item.account_key
                              ? ` · ${item.account_key === "builder" ? "Builder Account" : "Personal Account"}`
                              : ""}
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
              {contributions.length === 0 && partners.length > 0 && (
                <div className="project-partner-payments-empty">
                  <Wallet size={22} aria-hidden="true" />
                  <div>
                    <h3>Payment history</h3>
                    <p>
                      No payments recorded yet. Open a partner profile to record their first
                      payment.
                    </p>
                  </div>
                </div>
              )}
            </section>
          )}

          {tab === "estimate" && (
            <div id="project-panel-estimate" role="tabpanel" aria-labelledby="project-tab-estimate" className="project-estimate-panel">
              <div className="project-estimate-hero">
                <div className="project-estimate-hero-copy">
                  <span className="project-estimate-hero-icon"><Calculator size={27} aria-hidden="true" /></span>
                  <div>
                    <small>PROJECT FINANCIAL PLAN</small>
                    <h2>Project estimate</h2>
                    <p>Plan your costs and expected recovery before money is spent.</p>
                  </div>
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
              <div className="project-estimate-metrics">
                <div className="project-estimate-metric is-cost">
                  <span className="project-estimate-metric-icon"><Wallet size={23} /></span>
                  <span>Estimated costs</span>
                  <strong>{formatPKRInLakhCrore(costMin)} – {formatPKRInLakhCrore(costMax)}</strong>
                  <small>{costs.length} planned {costs.length === 1 ? "cost" : "costs"} · {formatPKR(costMin)} to {formatPKR(costMax)}</small>
                </div>
                <div className="project-estimate-metric is-recovery">
                  <span className="project-estimate-metric-icon"><HandCoins size={23} /></span>
                  <span>Expected recovery</span>
                  <strong>{formatPKRInLakhCrore(revenueMin)} – {formatPKRInLakhCrore(revenueMax)}</strong>
                  <small>{revenues.length} planned {revenues.length === 1 ? "recovery" : "recoveries"} · {formatPKR(revenueMin)} to {formatPKR(revenueMax)}</small>
                </div>
                <div className="project-estimate-metric is-margin">
                  <span className="project-estimate-metric-icon"><PieChart size={23} /></span>
                  <span>Projected margin range</span>
                  <strong>{revenues.length ? `${formatPKRInLakhCrore(revenueMin - costMax)} – ${formatPKRInLakhCrore(revenueMax - costMin)}` : "Add recovery items"}</strong>
                  <small>{revenues.length ? "Recovery after planned costs" : "Add expected recovery to see your margin"}</small>
                </div>
              </div>
              <div className="project-estimate-comparison">
                <div className="project-estimate-comparison-heading">
                  <span><PieChart size={20} /> The plan at a glance</span>
                  <small>Maximum planned amounts</small>
                </div>
                <div className="project-estimate-comparison-bars">
                  <div><span>Costs <strong>{formatPKR(costMax)}</strong></span><i><b className="is-cost" style={{ width: `${Math.round(costMax / Math.max(costMax, revenueMax, 1) * 100)}%` }} /></i></div>
                  <div><span>Recovery <strong>{formatPKR(revenueMax)}</strong></span><i><b className="is-recovery" style={{ width: `${Math.round(revenueMax / Math.max(costMax, revenueMax, 1) * 100)}%` }} /></i></div>
                </div>
                <p>{revenues.length ? "Compare the highest planned cost with the highest expected recovery. The margin above shows the possible range." : "Add recovery items to compare what the project may bring in against what it may cost."}</p>
              </div>
              <div className="project-estimate-explore">
                <h3>Explore the plan</h3>
                <p>Open a section when you want its chart, filters, or individual items.</p>
              </div>
              <details className="project-estimate-drawer is-cost">
                <summary>
                  <span className="project-estimate-drawer-icon"><Wallet size={22} /></span>
                  <span className="project-estimate-drawer-copy"><strong>Planned costs</strong><small>{costs.length} {costs.length === 1 ? "item" : "items"} · estimate breakdown and cost list</small></span>
                  <span className="project-estimate-drawer-total">{formatPKRInLakhCrore(costMin)} – {formatPKRInLakhCrore(costMax)}</span>
                  <ChevronDown size={19} className="project-estimate-drawer-chevron" />
                </summary>
                <div className="project-estimate-drawer-body">
                  {costs.length ? <EstimateChart items={costs} title="Estimated cost breakdown" /> : <div className="project-estimate-empty-chart"><Wallet size={26} /><h3>No planned costs yet</h3><p>Add an expected cost to see its range here.</p></div>}
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
                </div>
              </details>
              <details className="project-estimate-drawer is-recovery">
                <summary>
                  <span className="project-estimate-drawer-icon"><HandCoins size={22} /></span>
                  <span className="project-estimate-drawer-copy"><strong>Expected recovery</strong><small>{revenues.length} {revenues.length === 1 ? "item" : "items"} · sales estimates and recovery list</small></span>
                  <span className="project-estimate-drawer-total">{formatPKRInLakhCrore(revenueMin)} – {formatPKRInLakhCrore(revenueMax)}</span>
                  <ChevronDown size={19} className="project-estimate-drawer-chevron" />
                </summary>
                <div className="project-estimate-drawer-body">
                  {revenues.length ? <EstimateChart items={revenues} title="Expected recovery breakdown" /> : <div className="project-estimate-empty-chart is-recovery"><HandCoins size={26} /><h3>No expected recovery yet</h3><p>Add an expected recovery to compare it with costs.</p></div>}
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
              </details>
            </div>
          )}
          {tab === "costs" && (
            <div id="project-panel-costs" role="tabpanel" aria-labelledby="project-tab-costs" className="project-actual-panel">
              <div className="project-actual-hero">
                <div className="project-actual-hero-copy"><span><Wallet size={28} /></span><div><small>ALL PROJECT SPENDING</small><h2>Project costs</h2><p>Land, construction and other payments together in one place.</p></div></div>
                <div className="project-actual-actions"><Button onClick={() => setDialog("construction")}><Plus className="size-4" /> Add Construction Cost</Button><Button variant="outline" onClick={() => setDialog("actual")}><Plus className="size-4" /> Add Other Cost</Button></div>
              </div>
              <div className="project-actual-metrics">
                <div className="project-actual-metric is-spent"><span className="project-actual-metric-icon"><Wallet size={22} /></span><small>Total spent</small><strong>{formatPKRInLakhCrore(actualTotal)}</strong><p>{formatPKR(actualTotal)} · {allActualCosts.length} {allActualCosts.length === 1 ? "payment" : "payments"}</p></div>
                <div className="project-actual-metric is-plan"><span className="project-actual-metric-icon"><Calculator size={22} /></span><small>Estimated cost range</small><strong>{costs.length ? `${formatPKRInLakhCrore(costMin)} – ${formatPKRInLakhCrore(costMax)}` : "Not planned yet"}</strong><p>{costs.length ? `${costs.length} planned cost ${costs.length === 1 ? "item" : "items"}` : "Add expected costs in Estimate"}</p></div>
                <div className="project-actual-metric is-remaining"><span className="project-actual-metric-icon"><PieChart size={22} /></span><small>{actualTotal > costMax && costs.length ? "Over highest estimate" : "Until highest estimate"}</small><strong>{costs.length ? formatPKRInLakhCrore(Math.abs(costMax - actualTotal)) : "—"}</strong><p>{costs.length ? "Based on the maximum planned cost" : "Available after a cost estimate is added"}</p></div>
              </div>
              <div className="project-actual-insights">
                <section className="project-actual-source-card">
                  <div className="project-actual-section-title"><div><h3>Where the money went</h3><p>All recorded project costs by source</p></div></div>
                  <div className="project-actual-source-list">
                    {actualSources.map(({ key, label, icon: Icon, amount }) => (
                      <div key={key} className={`project-actual-source is-${key}`}><span className="project-actual-source-icon"><Icon size={18} /></span><div><span><strong>{label}</strong><b>{formatPKR(amount)}</b></span><i><em style={{ width: `${actualTotal ? (amount / actualTotal) * 100 : 0}%` }} /></i></div></div>
                    ))}
                  </div>
                </section>
                <section className="project-actual-chart-card">{actualFilter.visible.length ? <SpendingChart costs={actualFilter.visible} /> : <><div className="project-actual-section-title"><div><h3>Spending over time</h3><p>Running total for the selected records</p></div></div><div className="project-actual-chart-empty"><PieChart size={27} /><strong>No spending to chart</strong><span>{allActualCosts.length ? "Try changing your filters." : "Recorded costs will appear here."}</span></div></>}</section>
              </div>
              <section className="project-actual-history">
                <div className="project-actual-section-title"><div><h3>Cost history</h3><p>Review every recorded project payment</p></div><span>{actualFilter.visible.length} of {allActualCosts.length} shown</span></div>
                <details className="project-actual-filter"><summary><span><SlidersHorizontal size={18} /> Search & filter costs</span><span>{actualFilter.active ? "Filters applied" : "All costs"} <ChevronDown size={16} /></span></summary>{actualFilter.controls}</details>
                {actualFilter.active && <p className="project-actual-filter-summary">Matching total: <strong>{formatPKR(sum(actualFilter.visible.map((item) => item.amount)))}</strong> · Summary cards above include all costs.</p>}
                {actualFilter.visible.length === 0 ? <div className="project-actual-empty"><Wallet size={25} /><strong>{allActualCosts.length ? "No costs match these filters" : "No actual costs recorded yet"}</strong><p>{allActualCosts.length ? "Adjust your search or filters to see more records." : "Add a cost, or record a land or construction payment."}</p></div> :
                  <div className="project-actual-records">{actualFilter.visible.map((item) => { const source = item.type === "land_purchase" ? "land" : item.type === "construction_cost" ? "construction" : "other"; const Icon = source === "land" ? Landmark : source === "construction" ? HardHat : Wallet; return <article key={item.id} className={`project-actual-record is-${source}`}><span className="project-actual-record-icon"><Icon size={20} /></span><div className="project-actual-record-main"><strong>{item.description}</strong><span>{formatDate(item.date)} · {source === "land" ? "Land acquired" : source === "construction" ? "Construction Cost" : "Added here"}{item.method ? ` · ${item.method}` : ""}</span>{item.reference && <small>Ref: {item.reference}</small>}{source !== "land" && <><PaymentDetailsView transaction={item} /><SavedImageGallery documents={costDocuments.filter((receipt) => receipt.owner_id === item.id)} /></>}</div><b>{formatPKR(item.amount)}</b></article>; })}</div>}
              </section>
              <details className="project-actual-construction-details" onToggle={(event) => setConstructionDetailsOpen(event.currentTarget.open)}><summary><span><HardHat size={20} /> Construction spending detail</span><ChevronDown size={18} /></summary>{constructionDetailsOpen && <ConstructionCostInsights costs={constructionCosts} receipts={costDocuments} />}</details>
            </div>
          )}
          {tab === "sales" && (
            <ProjectSalesPanel projectId={project.id} buildingDetails={buildingDetails} />
          )}
          {tab === "profit" && (
            <ProjectProfitLossPanel projectId={project.id} costs={allActualCosts} partners={partners} />
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
              actualTitle={dialog === "construction" ? "Add Construction Cost" : "Add Other Cost"}
              costKind={dialog === "construction" ? "construction" : "project"}
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
                  <div className="project-land-steps" aria-label="Land acquisition steps">
                    {["Land details", "Payment", "Images"].map((label, index) => (
                      <span
                        key={label}
                        className={
                          index === landStep ? "is-active" : index < landStep ? "is-complete" : ""
                        }
                      >
                        <b>{index + 1}</b>
                        {label}
                      </span>
                    ))}
                  </div>
                  {landStep === 0 && (
                    <>
                      <div className="project-stage-intro">
                        <Landmark size={20} />
                        <div>
                          <strong>Tell us about the land</strong>
                          <p>
                            These details will stay with this project so you can see what was
                            acquired.
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
                        <Label htmlFor="stage-land-notes">Notes (optional)</Label>
                        <textarea
                          id="stage-land-notes"
                          value={landNotes}
                          onChange={(event) => setLandNotes(event.target.value)}
                          rows={2}
                          placeholder="Any useful detail about this land"
                        />
                      </div>
                    </>
                  )}
                  {landStep === 1 && (
                    <>
                      <div className="project-stage-intro">
                        <Wallet size={20} />
                        <div>
                          <strong>Purchase payment</strong>
                          <p>Choose the paying account and how money reached the seller.</p>
                        </div>
                      </div>
                      <div>
                        {landPrice.trim() && (
                          <>
                            <BankAccountSelect
                              value={landAccount}
                              onChange={(value) => {
                                setLandAccount(value);
                                setLandPaymentDetails((current) => ({
                                  ...current,
                                  paid_to: current.paid_to || landSeller,
                                }));
                              }}
                            />
                            {landAccount && (
                              <div className="project-stage-payment">
                                <div className="project-stage-intro">
                                  <Wallet size={20} />
                                  <div>
                                    <strong>How was this land paid for?</strong>
                                    <p>
                                      Save the payment details with this land purchase and show them
                                      in Bank.
                                    </p>
                                  </div>
                                </div>
                                <div className="project-stage-grid">
                                  <div>
                                    <Label htmlFor="stage-land-method">Payment method *</Label>
                                    <select
                                      id="stage-land-method"
                                      value={landPaymentDetails.method}
                                      onChange={(event) => {
                                        setLandPaymentDetails({
                                          ...emptyLandPaymentDetails,
                                          paid_to: landPaymentDetails.paid_to || landSeller,
                                          method: event.target
                                            .value as LandPaymentDetails["method"],
                                        });
                                        setLandPaymentImages([]);
                                      }}
                                    >
                                      <option value="cash">Cash</option>
                                      <option value="bank">Bank transfer</option>
                                      <option value="digital">Digital / mobile wallet</option>
                                      <option value="cheque">Cheque</option>
                                      <option value="other">Other</option>
                                    </select>
                                  </div>
                                  <div>
                                    <Label htmlFor="stage-land-paid-to">Paid to *</Label>
                                    <input
                                      id="stage-land-paid-to"
                                      value={landPaymentDetails.paid_to}
                                      onChange={(event) =>
                                        setLandPaymentDetails((current) => ({
                                          ...current,
                                          paid_to: event.target.value,
                                        }))
                                      }
                                      placeholder="Seller or recipient"
                                    />
                                  </div>
                                </div>
                                {landPaymentDetails.method !== "cash" && (
                                  <div className="project-stage-grid">
                                    <div>
                                      <Label htmlFor="stage-land-provider">
                                        {landPaymentDetails.method === "digital"
                                          ? "Wallet / app name *"
                                          : landPaymentDetails.method === "other"
                                            ? "Payment service *"
                                            : "Bank name *"}
                                      </Label>
                                      <input
                                        id="stage-land-provider"
                                        value={landPaymentDetails.provider}
                                        onChange={(event) =>
                                          setLandPaymentDetails((current) => ({
                                            ...current,
                                            provider: event.target.value,
                                          }))
                                        }
                                        placeholder={
                                          landPaymentDetails.method === "digital"
                                            ? "e.g. Easypaisa"
                                            : "e.g. Meezan Bank"
                                        }
                                      />
                                    </div>
                                    <div>
                                      <Label htmlFor="stage-land-reference">
                                        {landPaymentDetails.method === "cheque"
                                          ? "Cheque number *"
                                          : landPaymentDetails.method === "bank" ||
                                              landPaymentDetails.method === "digital"
                                            ? "Transaction reference *"
                                            : "Reference (optional)"}
                                      </Label>
                                      <input
                                        id="stage-land-reference"
                                        value={landPaymentDetails.reference}
                                        onChange={(event) =>
                                          setLandPaymentDetails((current) => ({
                                            ...current,
                                            reference: event.target.value,
                                          }))
                                        }
                                      />
                                    </div>
                                  </div>
                                )}
                                {(landPaymentDetails.method === "bank" ||
                                  landPaymentDetails.method === "digital" ||
                                  landPaymentDetails.method === "cheque") && (
                                  <div className="project-stage-grid">
                                    <div>
                                      <Label htmlFor="stage-land-account-name">
                                        {landPaymentDetails.method === "cheque"
                                          ? "Account holder / payer"
                                          : "Account holder"}
                                      </Label>
                                      <input
                                        id="stage-land-account-name"
                                        value={landPaymentDetails.account_name}
                                        onChange={(event) =>
                                          setLandPaymentDetails((current) => ({
                                            ...current,
                                            account_name: event.target.value,
                                          }))
                                        }
                                      />
                                    </div>
                                    <div>
                                      <Label htmlFor="stage-land-account-no">
                                        {landPaymentDetails.method === "digital"
                                          ? "Wallet / mobile number"
                                          : "Account number (optional)"}
                                      </Label>
                                      <input
                                        id="stage-land-account-no"
                                        value={landPaymentDetails.account_no}
                                        onChange={(event) =>
                                          setLandPaymentDetails((current) => ({
                                            ...current,
                                            account_no: event.target.value,
                                          }))
                                        }
                                      />
                                    </div>
                                  </div>
                                )}
                                {landPaymentDetails.method === "cheque" && (
                                  <div>
                                    <Label htmlFor="stage-land-cheque-date">Cheque date *</Label>
                                    <input
                                      id="stage-land-cheque-date"
                                      type="date"
                                      value={landPaymentDetails.cheque_date}
                                      onChange={(event) =>
                                        setLandPaymentDetails((current) => ({
                                          ...current,
                                          cheque_date: event.target.value,
                                        }))
                                      }
                                    />
                                  </div>
                                )}
                                <div className="project-payment-images">
                                  <Label htmlFor="stage-land-payment-images">
                                    {landPaymentDetails.method === "cash"
                                      ? "Cash payment photo (optional)"
                                      : landPaymentDetails.method === "cheque"
                                        ? "Cheque image (optional)"
                                        : landPaymentDetails.method === "bank"
                                          ? "Bank transfer receipt (optional)"
                                          : landPaymentDetails.method === "digital"
                                            ? "Digital payment receipt (optional)"
                                            : "Payment proof image (optional)"}
                                  </Label>
                                  <p>
                                    {landPaymentDetails.method === "cash"
                                      ? "Add a photo of a signed cash receipt or payment acknowledgement."
                                      : landPaymentDetails.method === "cheque"
                                        ? "Add a photo of the cheque or deposit slip."
                                        : landPaymentDetails.method === "bank"
                                          ? "Add a screenshot or photo of the transfer receipt."
                                          : landPaymentDetails.method === "digital"
                                            ? "Add a screenshot of the wallet payment confirmation."
                                            : "Add a photo of any payment record you have."}
                                  </p>
                                  <input
                                    key={landPaymentDetails.method}
                                    id="stage-land-payment-images"
                                    className="project-image-file-input"
                                    type="file"
                                    accept="image/jpeg,image/png,image/webp,image/gif"
                                    multiple
                                    onChange={(event) => {
                                      const files = Array.from(event.target.files ?? []);
                                      const invalid = files.find(
                                        (file) =>
                                          !["image/jpeg", "image/png", "image/webp", "image/gif"].includes(file.type) ||
                                          !file.size || file.size > 10 * 1024 * 1024,
                                      );
                                      if (invalid) {
                                        setStatusError("Choose JPEG, PNG, WebP or GIF images smaller than 10 MB each.");
                                        event.target.value = "";
                                        return;
                                      }
                                      setStatusError("");
                                      setLandPaymentImages(files);
                                    }}
                                  />
                                  <label className="project-image-upload project-image-upload-payment" htmlFor="stage-land-payment-images">
                                    <span className="project-image-upload-icon"><Upload size={21} aria-hidden="true" /></span>
                                    <span><strong>Upload payment images</strong><small>{landPaymentImages.length ? `${landPaymentImages.length} selected · choose again to replace` : "Choose one or more images"}</small></span>
                                  </label>
                                  <SelectedImagePreviews files={landPaymentImages} />
                                </div>
                              </div>
                            )}
                          </>
                        )}
                        {!landPrice.trim() && (
                          <p className="project-stage-hint">
                            No purchase price was entered. You can continue without payment details.
                          </p>
                        )}
                      </div>
                    </>
                  )}
                  {landStep === 2 && (
                    <div className="project-land-images">
                      <div className="project-stage-intro">
                        <FolderOpen size={20} />
                        <div>
                          <strong>Add land images</strong>
                          <p>Optional images are saved in Documents and linked to this land.</p>
                        </div>
                      </div>
                      <Label htmlFor="stage-land-images">Land photos, receipts or maps</Label>
                      <input
                        id="stage-land-images"
                        className="project-image-file-input"
                        type="file"
                        accept="image/jpeg,image/png,image/webp,image/gif"
                        multiple
                        onChange={(event) => {
                          const files = Array.from(event.target.files ?? []);
                          const invalid = files.find(
                            (file) =>
                              !["image/jpeg", "image/png", "image/webp", "image/gif"].includes(
                                file.type,
                              ) ||
                              !file.size ||
                              file.size > 10 * 1024 * 1024,
                          );
                          if (invalid) {
                            setStatusError(
                              "Choose JPEG, PNG, WebP or GIF images smaller than 10 MB each.",
                            );
                            event.target.value = "";
                            return;
                          }
                          setStatusError("");
                          setLandImages(files);
                        }}
                      />
                      <label className="project-image-upload" htmlFor="stage-land-images">
                        <span className="project-image-upload-icon"><Upload size={21} aria-hidden="true" /></span>
                        <span><strong>Upload land images</strong><small>{landImages.length ? `${landImages.length} selected · choose again to replace` : "Choose one or more images"}</small></span>
                      </label>
                      <p>Up to 10 MB per image. You can select more than one.</p>
                      <SelectedImagePreviews files={landImages} />
                    </div>
                  )}
                </div>
              )}
              {statusDraft === "under construction" && (
                <p className="project-stage-hint">
                  Construction payments can be added in the Costs tab after you save
                  this status.
                </p>
              )}
              {statusError && (
                <p role="alert" className="text-sm text-destructive">
                  {statusError}
                </p>
              )}
              <DialogFooter>
                {statusDraft === "land acquired" && landStep > 0 && (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={savingStatus}
                    onClick={() => {
                      setStatusError("");
                      setLandStep((step) => step - 1);
                    }}
                  >
                    Back
                  </Button>
                )}
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
                  onClick={
                    statusDraft === "land acquired" && landStep < 2 ? nextLandStep : saveStatus
                  }
                >
                  {savingStatus
                    ? "Saving…"
                    : statusDraft === "land acquired"
                      ? landStep < 2
                        ? "Next"
                        : "Save land and status"
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
                  <p className="partner-profile-share-summary">
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
                      variant="outline"
                      onClick={() => {
                        setEditingPartner(selectedPartner);
                        setSelectedPartnerId(null);
                      }}
                    >
                      <Pencil className="size-4" />
                      Edit Partner
                    </Button>
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
          {(partnerDialog || editingPartner) && (
            <ProjectPartnerDialog
              projectId={project.id}
              partner={partnerDialog && partnerDialog !== "new" ? partnerDialog : undefined}
              editingPartner={editingPartner ?? undefined}
              remainingShareBp={10_000 - allocatedShareBp + (editingPartner?.share_bp ?? 0)}
              onOpenChange={(open) => {
                if (!open) {
                  setPartnerDialog(null);
                  setEditingPartner(null);
                }
              }}
              onAddPartner={savePartner}
              onContribution={saveContribution}
              onUpdatePartner={savePartnerUpdate}
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
  const { visible, controls, active, reset } = useRecordFilters(items, {
    label: title.toLowerCase(),
    searchText: (item) => [item.title, item.details].filter(Boolean).join(" "),
    amount: (item) => item.maximum_amount,
  });
  return (
    <section className="project-estimate-section">
      <div className="project-estimate-section-heading">
        <div><h3>{title}</h3><p>Review and update each planned amount.</p></div>
        <span>{items.length} {items.length === 1 ? "item" : "items"}</span>
      </div>
      <details className="project-estimate-filter">
        <summary><span><SlidersHorizontal size={18} /> Search & filter {title.toLowerCase()}</span><span>{active ? "Filters applied" : "All items"} <ChevronDown size={16} /></span></summary>
        {controls}
      </details>
      {active && <div className="project-estimate-filter-results"><span>{visible.length} of {items.length} shown</span><button type="button" onClick={reset}>Clear filters</button></div>}
      {items.length > 0 && visible.length === 0 && (
        <p className="filter-empty">No estimate items match these filters.</p>
      )}
      {items.length === 0 ? (
        <div className="project-estimate-empty-list"><Calculator size={23} /><strong>No items added yet</strong><p>Use the button above to start this part of the plan.</p></div>
      ) : (
        <div className="project-estimate-items">
              {visible.map((item) => {
                const flatLines = flatRecoveryLines(item);
                const link = recoveryLink(item);
                const floorCount = new Set(flatLines.map((line) => line.floor_index)).size;
                return (
                <article key={item.id} className="project-estimate-item">
                  <div className="project-estimate-item-top">
                    <span className="project-estimate-item-icon"><Calculator size={18} /></span>
                    <div><h4>{item.title}</h4>
                    {link && (
                      <p>
                        {link.quantity} {link.space} included
                        {floorCount > 0 ? ` · ${floorCount} ${floorCount === 1 ? "floor" : "floors"}` : " · priced per unit"}
                      </p>
                    )}
                    </div>
                    <div className="project-estimate-item-actions">
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
                    </div>
                  </div>
                  <div className="project-estimate-item-amounts"><span><small>Minimum</small><strong>{formatPKR(item.minimum_amount)}</strong></span><span><small>Maximum</small><strong>{formatPKR(item.maximum_amount)}</strong></span></div>
                  {flatLines.length > 0 && (
                    <details className="project-estimate-flat-details">
                      <summary><span>View prices by floor</span><span>{flatLines.length} flat {flatLines.length === 1 ? "type" : "types"} <ChevronDown size={16} /></span></summary>
                      <div className="project-estimate-flat-lines">
                        {flatLines.map((line) => (
                          <div key={`${line.floor_index}-${line.rooms}`}>
                            <span><strong>{line.floor_index === 0 ? "Ground" : `Floor ${line.floor_index}`}</strong><small>{line.quantity} × {line.rooms}-room flats</small></span>
                            <strong>{formatPKR(line.minimum_unit_price)} – {formatPKR(line.maximum_unit_price)} <small>each</small></strong>
                          </div>
                        ))}
                      </div>
                    </details>
                  )}
                  {item.details && <p className="project-estimate-item-note">{item.details}</p>}
                </article>
              );})}
        </div>
      )}
    </section>
  );
}
