import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProjectDetailPage } from "@/features/projects/pages/ProjectDetailPage";
import { getProjectById, updateProjectStatus } from "@/data/repositories/projectsRepository";
import { getProjectLand, saveProjectStage } from "@/data/repositories/projectStageRepository";
import { listConstructionCostReceipts, listLandDocuments, saveConstructionCostReceipt, saveLandImage, saveLandPaymentReceipt } from "@/data/repositories/documentsRepository";
import {
  addProjectEstimate,
  archiveProjectEstimate,
  updateProjectEstimate,
  listProjectEstimates,
  listActualProjectCosts,
  listConstructionCosts,
  addConstructionCost,
} from "@/data/repositories/projectFinanceRepository";
import {
  getProjectBuildingDetails,
  saveProjectBuildingDetails,
} from "@/data/repositories/projectBuildingRepository";
import {
  listProjectPartners,
  listPartnerContributions,
  addProjectPartner,
  addPartnerContribution,
  updateProjectPartner,
} from "@/data/repositories/projectPartnersRepository";
import type { Transaction } from "@/domain/types";
import type { ProjectBuildingDetails } from "@/domain/types";

vi.mock("@/data/repositories/projectsRepository", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/data/repositories/projectsRepository")>()),
  getProjectById: vi.fn(),
  updateProjectStatus: vi.fn(),
}));
vi.mock("@/data/repositories/projectStageRepository", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/data/repositories/projectStageRepository")>()),
  getProjectLand: vi.fn(),
  saveProjectStage: vi.fn(),
}));
vi.mock("@/data/repositories/documentsRepository", () => ({ listConstructionCostReceipts: vi.fn(), listLandDocuments: vi.fn(), saveConstructionCostReceipt: vi.fn(), saveLandImage: vi.fn(), saveLandPaymentReceipt: vi.fn() }));
vi.mock("@/data/repositories/projectFinanceRepository", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/data/repositories/projectFinanceRepository")>()),
  listProjectEstimates: vi.fn(),
  listActualProjectCosts: vi.fn(),
  listConstructionCosts: vi.fn(),
  addConstructionCost: vi.fn(),
  archiveProjectEstimate: vi.fn(),
  addProjectEstimate: vi.fn(),
  updateProjectEstimate: vi.fn(),
}));
vi.mock("@/data/repositories/projectBuildingRepository", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/data/repositories/projectBuildingRepository")>()),
  getProjectBuildingDetails: vi.fn(),
  saveProjectBuildingDetails: vi.fn(),
}));
vi.mock("@/data/repositories/projectPartnersRepository", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/data/repositories/projectPartnersRepository")>()),
  listProjectPartners: vi.fn(),
  listPartnerContributions: vi.fn(),
  addProjectPartner: vi.fn(),
  addPartnerContribution: vi.fn(),
  updateProjectPartner: vi.fn(),
}));

describe("ProjectDetailPage", () => {
  beforeEach(() => {
    vi.mocked(getProjectById).mockResolvedValue({
      id: "11111111-1111-4111-8111-111111111111",
      name: "Baloch Residency",
      code: "BR-01",
      location: "Quetta",
      description: null,
      status: "planning",
      start_date: null,
      archived: 0,
      custom: "{}",
      created_at: "2026-09-22",
      updated_at: "2026-09-22",
    });
    vi.mocked(listProjectEstimates).mockResolvedValue([]);
    vi.mocked(listActualProjectCosts).mockResolvedValue([]);
    vi.mocked(listConstructionCosts).mockResolvedValue([]);
    vi.mocked(archiveProjectEstimate).mockResolvedValue(undefined);
    vi.mocked(getProjectBuildingDetails).mockResolvedValue(null);
    vi.mocked(getProjectLand).mockResolvedValue(null);
    vi.mocked(listLandDocuments).mockResolvedValue([]);
    vi.mocked(listConstructionCostReceipts).mockResolvedValue([]);
    vi.mocked(saveConstructionCostReceipt).mockResolvedValue({ id: "receipt-1", title: "receipt.png", owner_id: "cost-1", owner_type: "transaction", doc_type: "construction_cost_receipt", doc_date: "2026-10-04", notes: null, file_path: "receipt.png", mime: "image/png", size: 10, project_name: "Baloch Residency", created_at: "2026-10-04" });
    vi.mocked(listProjectPartners).mockResolvedValue([]);
    vi.mocked(listPartnerContributions).mockResolvedValue([]);
    vi.mocked(addProjectPartner).mockResolvedValue(undefined);
    vi.mocked(addPartnerContribution).mockResolvedValue(undefined);
    vi.mocked(updateProjectPartner).mockReset();
  });

  it("opens on the project dashboard and explains charts without saved data", async () => {
    render(
      <MemoryRouter initialEntries={["/projects/11111111-1111-4111-8111-111111111111"]}>
        <Routes>
          <Route path="/projects/:projectId" element={<ProjectDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(await screen.findByRole("tab", { name: "Dashboard" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("heading", { name: "Baloch Residency dashboard" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Building mix" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Spending over time" })).toBeInTheDocument();
    expect(screen.getByText(/Record actual project costs to see a line chart/)).toBeInTheDocument();
  });

  it("changes the project status and shows the saved stage", async () => {
    vi.mocked(updateProjectStatus).mockResolvedValue({
      id: "11111111-1111-4111-8111-111111111111",
      name: "Baloch Residency",
      code: "BR-01",
      location: "Quetta",
      description: null,
      status: "under construction",
      start_date: null,
      archived: 0,
      custom: "{}",
      created_at: "2026-09-22",
      updated_at: "2026-09-24",
    });
    render(
      <MemoryRouter initialEntries={["/projects/11111111-1111-4111-8111-111111111111"]}>
        <Routes>
          <Route path="/projects/:projectId" element={<ProjectDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(await screen.findByRole("heading", { name: "Baloch Residency" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Change Status" }));
    fireEvent.change(screen.getByLabelText("Project status"), {
      target: { value: "under construction" },
    });
    for (const account of screen.queryAllByLabelText(/^(Pay from|Receive into) account/))
      fireEvent.change(account, { target: { value: "builder" } });
    fireEvent.click(screen.getByRole("button", { name: "Save status" }));
    await waitFor(() =>
      expect(updateProjectStatus).toHaveBeenCalledWith(
        "11111111-1111-4111-8111-111111111111",
        "under construction",
      ),
    );
    expect(screen.getByText("Quetta")).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: "Project at Construction, stage 3 of 4" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Construction Cost" })).toBeInTheDocument();
  });

  it("includes the acquired land price in actual costs without a second payment", async () => {
    vi.mocked(getProjectLand).mockResolvedValue({
      id: "land-1",
      title: "Residency plot",
      location: "Quetta",
      purchase_date: "2026-09-22",
      area_value: 7000,
      area_unit: "sqyd",
      seller_name: "Ali",
      price: 19_000_000,
      notes: "",
    });
    render(
      <MemoryRouter initialEntries={["/projects/11111111-1111-4111-8111-111111111111"]}>
        <Routes>
          <Route path="/projects/:projectId" element={<ProjectDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(
      await screen.findByRole("heading", { name: "Baloch Residency dashboard" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /Spending rose to Rs 19,000,000/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "Actual Cost" }));
    expect(screen.getByText("Land purchase: Residency plot")).toBeInTheDocument();
    expect(screen.getAllByText("Land acquired").length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText("Rs 19,000,000").length).toBeGreaterThanOrEqual(2);
    expect(addConstructionCost).not.toHaveBeenCalled();
  });

  it("combines the land price and saved construction payments in the actual total", async () => {
    vi.mocked(getProjectLand).mockResolvedValue({
      id: "land-1",
      title: "Residency plot",
      location: "Quetta",
      purchase_date: "2026-09-22",
      area_value: 7000,
      area_unit: "sqyd",
      seller_name: "Ali",
      price: 19_000_000,
      notes: "",
    });
    vi.mocked(listActualProjectCosts).mockResolvedValue([
      {
        id: "construction-1",
        date: "2026-09-23",
        amount: 50_000,
        description: "Cement",
        type: "construction_cost",
      } as Transaction,
    ]);
    vi.mocked(listConstructionCosts).mockResolvedValue([
      {
        id: "construction-1",
        date: "2026-09-23",
        amount: 50_000,
        description: "Cement",
        type: "construction_cost",
      } as Transaction,
    ]);
    render(
      <MemoryRouter initialEntries={["/projects/11111111-1111-4111-8111-111111111111"]}>
        <Routes>
          <Route path="/projects/:projectId" element={<ProjectDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(
      await screen.findByRole("img", { name: /Spending rose to Rs 19,050,000/ }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "Actual Cost" }));
    expect(screen.getByText("Land purchase: Residency plot")).toBeInTheDocument();
    expect(screen.getByText("Cement")).toBeInTheDocument();
    expect(screen.getAllByText("Construction Cost").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Rs 19,050,000").length).toBeGreaterThanOrEqual(1);
  });

  it("requires land details and saves them with the acquired status", async () => {
    vi.mocked(getProjectLand)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: "land-1",
        title: "Baloch Residency",
        location: "Gul Muhammad Lane",
        purchase_date: "2026-10-03",
        area_value: 7000,
        area_unit: "sqyd",
        seller_name: "Muhammad Murad",
        price: 32_000_000,
        account_key: "builder",
        payment_details: null,
        notes: "",
      });
    vi.mocked(saveLandImage).mockResolvedValue();
    vi.mocked(saveLandPaymentReceipt).mockResolvedValue();
    vi.mocked(saveProjectStage).mockImplementation(async (_id, status) => ({
      ...(await getProjectById("11111111-1111-4111-8111-111111111111"))!,
      status,
    }));
    render(
      <MemoryRouter initialEntries={["/projects/11111111-1111-4111-8111-111111111111"]}>
        <Routes>
          <Route path="/projects/:projectId" element={<ProjectDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(await screen.findByRole("heading", { name: "Baloch Residency" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Change Status" }));
    fireEvent.change(screen.getByLabelText("Project status"), {
      target: { value: "land acquired" },
    });
    expect(screen.getByText("Tell us about the land")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Land location *"), { target: { value: "" } });
    for (const account of screen.queryAllByLabelText(/^(Pay from|Receive into) account/))
      fireEvent.change(account, { target: { value: "builder" } });
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Enter the land location");
    expect(saveProjectStage).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Land location *"), {
      target: { value: "Gul Muhammad Lane" },
    });
    fireEvent.change(screen.getByLabelText("Area (optional)"), { target: { value: "7000" } });
    fireEvent.change(screen.getByLabelText("Purchase price in Rs (optional)"), {
      target: { value: "32000000" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    for (const account of screen.queryAllByLabelText(/^(Pay from|Receive into) account/))
      fireEvent.change(account, { target: { value: "builder" } });
    expect(screen.getByText("How was this land paid for?")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Payment method *"), { target: { value: "bank" } });
    fireEvent.change(screen.getByLabelText("Paid to *"), { target: { value: "Muhammad Murad" } });
    fireEvent.change(screen.getByLabelText("Bank name *"), { target: { value: "Meezan Bank" } });
    fireEvent.change(screen.getByLabelText("Transaction reference *"), {
      target: { value: "TRX-42" },
    });
    expect(screen.getByLabelText("Bank transfer receipt (optional)")).toBeInTheDocument();
    const receipt = new File(["image"], "transfer.png", { type: "image/png" });
    fireEvent.change(screen.getByLabelText("Bank transfer receipt (optional)"), {
      target: { files: [receipt] },
    });
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByLabelText("Land photos, receipts or maps")).toBeInTheDocument();
    const photo = new File(["image"], "plot.png", { type: "image/png" });
    fireEvent.change(screen.getByLabelText("Land photos, receipts or maps"), {
      target: { files: [photo] },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save land and status" }));
    await waitFor(() =>
      expect(saveProjectStage).toHaveBeenCalledWith(
        "11111111-1111-4111-8111-111111111111",
        "land acquired",
        expect.objectContaining({
          location: "Gul Muhammad Lane",
          area_value: 7000,
          area_unit: "sqyd",
          account_key: "builder",
          payment_details: expect.objectContaining({
            method: "bank",
            paid_to: "Muhammad Murad",
            provider: "Meezan Bank",
            reference: "TRX-42",
          }),
        }),
      ),
    );
    await waitFor(() =>
      expect(saveLandImage).toHaveBeenCalledWith("land-1", photo, expect.any(String)),
    );
    await waitFor(() =>
      expect(saveLandPaymentReceipt).toHaveBeenCalledWith("land-1", receipt, expect.any(String), "bank"),
    );
    expect(screen.queryByText(/Land acquired: Baloch Residency/)).not.toBeInTheDocument();
  });

  it("shows the updated acquired plot area throughout the building view", async () => {
    vi.mocked(getProjectLand).mockResolvedValue({
      id: "land-1",
      title: "Residency plot",
      location: "Quetta",
      purchase_date: "2026-09-22",
      area_value: 7000,
      area_unit: "sqyd",
      seller_name: "",
      price: null,
      notes: "",
    });
    vi.mocked(getProjectBuildingDetails).mockResolvedValue({
      id: "building-1",
      project_id: "11111111-1111-4111-8111-111111111111",
      building_use: "residential",
      floors_above_ground: 1,
      basement_count: 0,
      planned_flats: 2,
      planned_shops: null,
      planned_offices: null,
      planned_houses: null,
      planned_parking_spaces: null,
      parking_area_value: null,
      parking_area_unit: null,
      plot_area_value: 7000,
      plot_area_unit: "sqyd",
      covered_area_sqft: null,
      has_masjid: 0,
      selected_spaces_json: '["flats"]',
      floor_layout_json: '[{"floor_index":0,"flat_types":[{"rooms":2,"count":2}]}]',
      notes: null,
      archived: 0,
      custom: "{}",
      created_at: "2026-09-22",
      updated_at: "2026-09-22",
    } as ProjectBuildingDetails);
    vi.mocked(saveProjectStage).mockImplementation(async (_id, status) => ({
      ...(await getProjectById("11111111-1111-4111-8111-111111111111"))!,
      status,
    }));
    render(
      <MemoryRouter initialEntries={["/projects/11111111-1111-4111-8111-111111111111"]}>
        <Routes>
          <Route path="/projects/:projectId" element={<ProjectDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(await screen.findByRole("heading", { name: "Baloch Residency" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Change Status" }));
    fireEvent.change(screen.getByLabelText("Project status"), {
      target: { value: "land acquired" },
    });
    fireEvent.change(screen.getByLabelText("Area (optional)"), { target: { value: "10000" } });
    for (const account of screen.queryAllByLabelText(/^(Pay from|Receive into) account/))
      fireEvent.change(account, { target: { value: "builder" } });
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.click(screen.getByRole("button", { name: "Save land and status" }));
    await waitFor(() =>
      expect(saveProjectStage).toHaveBeenCalledWith(
        expect.any(String),
        "land acquired",
        expect.objectContaining({ area_value: 10000 }),
      ),
    );
    fireEvent.click(screen.getByRole("tab", { name: "Building" }));
    fireEvent.click(screen.getByRole("tab", { name: "Areas & details" }));
    expect(screen.getByText("10,000 sq yd")).toBeInTheDocument();
    expect(screen.queryByText("7,000 sq yd")).not.toBeInTheDocument();
  });

  it("records construction costs in their own tab after changing status", async () => {
    vi.mocked(updateProjectStatus).mockImplementation(async (_id, status) => ({
      ...(await getProjectById("11111111-1111-4111-8111-111111111111"))!,
      status,
    }));
    vi.mocked(addConstructionCost).mockImplementation(
      async (input) =>
        ({
          id: "cost-1",
          date: input.date,
          amount: input.amount,
          description: input.description,
          project_id: input.project_id,
          direction: "out",
          type: "construction_cost",
          method: input.method,
          reference: input.reference,
          contact_id: null,
          category_id: null,
          related_transaction_id: null,
          land_id: null,
          partner_id: null,
          receipt_document_id: null,
          notes: null,
          archived: 0,
          custom: "{}",
          created_at: "2026-09-27",
          updated_at: "2026-09-27",
        }) as Transaction,
    );
    render(
      <MemoryRouter initialEntries={["/projects/11111111-1111-4111-8111-111111111111"]}>
        <Routes>
          <Route path="/projects/:projectId" element={<ProjectDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(await screen.findByRole("heading", { name: "Baloch Residency" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Change Status" }));
    fireEvent.change(screen.getByLabelText("Project status"), {
      target: { value: "under construction" },
    });
    expect(screen.queryByLabelText("Amount paid (Rs) *")).not.toBeInTheDocument();
    for (const account of screen.queryAllByLabelText(/^(Pay from|Receive into) account/))
      fireEvent.change(account, { target: { value: "builder" } });
    fireEvent.click(screen.getByRole("button", { name: "Save status" }));
    await waitFor(() =>
      expect(updateProjectStatus).toHaveBeenCalledWith(expect.any(String), "under construction"),
    );
    fireEvent.click(screen.getByRole("tab", { name: "Construction Cost" }));
    fireEvent.click(screen.getByRole("button", { name: "Add Construction Cost" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("Add Construction Cost");
    fireEvent.change(screen.getByLabelText("Amount paid (Rs) *"), { target: { value: "50000" } });
    fireEvent.change(screen.getByLabelText("Cost description *"), { target: { value: "Cement" } });
    fireEvent.click(screen.getByRole("radio", { name: "Builder Account" }));
    fireEvent.click(screen.getByRole("button", { name: "Bank transfer" }));
    expect(screen.getByLabelText("Sending bank *")).toBeInTheDocument();
    expect(screen.queryByLabelText("Receipt number (optional)")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Sending bank *"), { target: { value: "Meezan" } });
    fireEvent.change(screen.getByLabelText("Receiving bank *"), { target: { value: "HBL" } });
    fireEvent.change(screen.getByLabelText("Transfer reference *"), { target: { value: "TRX-123" } });
    const receipt = new File(["receipt"], "receipt.png", { type: "image/png" });
    fireEvent.change(screen.getByLabelText(/Add receipt images/), { target: { files: [receipt] } });
    expect(screen.getByText("1 image selected")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(addConstructionCost).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: 50000,
          description: "Cement",
          account_key: "builder",
          method: "bank",
          reference: "TRX-123",
          payment_details: expect.objectContaining({ from_bank: "Meezan", to_bank: "HBL" }),
        }),
      ),
    );
    await waitFor(() => expect(saveConstructionCostReceipt).toHaveBeenCalledWith("cost-1", receipt, expect.any(String)));
    expect(
      screen.getByText("Cement", { selector: ".construction-payment-card strong" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "Actual Cost" }));
    expect(screen.getByText("Cement")).toBeInTheDocument();
  });

  it("opens the estimate and actual cost entry modals from their tabs", async () => {
    render(
      <MemoryRouter initialEntries={["/projects/11111111-1111-4111-8111-111111111111"]}>
        <Routes>
          <Route path="/projects/:projectId" element={<ProjectDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(await screen.findByRole("heading", { name: "Baloch Residency" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "Estimate" }));
    fireEvent.click(screen.getByRole("button", { name: "Add Expected Cost" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("Minimum estimate");
    expect(screen.getByLabelText("Cost item *")).toBeInTheDocument();
    expect(screen.queryByLabelText("Recovery item name *")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Cost item *"), { target: { value: "Cement Cost" } });
    expect(screen.getByLabelText("Cost item *")).toHaveValue("Cement Cost");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.click(screen.getByRole("button", { name: "Add Expected Recovery" }));
    expect(
      screen.getByText(/Add flats, shops, offices or houses in Building Details/),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("Cost item *")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.click(screen.getByRole("tab", { name: "Actual Cost" }));
    fireEvent.click(screen.getByRole("button", { name: "Add Actual Cost" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("Amount paid");
  });

  it("saves selected and custom costs separately from recovery", async () => {
    vi.mocked(getProjectBuildingDetails).mockResolvedValue({
      id: "building-1",
      project_id: "11111111-1111-4111-8111-111111111111",
      building_use: "mixed-use",
      floors_above_ground: 4,
      basement_count: 0,
      planned_flats: 13,
      planned_shops: 5,
      planned_offices: null,
      planned_houses: null,
      planned_parking_spaces: null,
      parking_area_value: null,
      parking_area_unit: null,
      plot_area_value: null,
      plot_area_unit: null,
      covered_area_sqft: null,
      has_masjid: 0,
      selected_spaces_json: '["flats","shops"]',
      floor_layout_json: "[]",
      notes: null,
      archived: 0,
      custom: "{}",
      created_at: "2026-09-22",
      updated_at: "2026-09-22",
    });
    vi.mocked(addProjectEstimate).mockImplementation(async (value) => ({
      ...value,
      id: `estimate-${value.kind}`,
      archived: 0,
      custom: "{}",
      created_at: "2026-09-22",
      updated_at: "2026-09-22",
    }));
    render(
      <MemoryRouter initialEntries={["/projects/11111111-1111-4111-8111-111111111111"]}>
        <Routes>
          <Route path="/projects/:projectId" element={<ProjectDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );
    fireEvent.click(await screen.findByRole("tab", { name: "Estimate" }));
    fireEvent.click(screen.getByRole("button", { name: "Add Expected Cost" }));
    fireEvent.change(screen.getByLabelText("Cost item *"), { target: { value: "other" } });
    fireEvent.change(screen.getByLabelText("Other cost name *"), {
      target: { value: "Transport Cost" },
    });
    fireEvent.change(screen.getByLabelText(/Minimum estimate/i), { target: { value: "1000" } });
    fireEvent.change(screen.getByLabelText(/Maximum estimate/i), { target: { value: "2000" } });
    for (const account of screen.queryAllByLabelText(/^(Pay from|Receive into) account/))
      fireEvent.change(account, { target: { value: "builder" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(addProjectEstimate).toHaveBeenCalledWith(
        expect.objectContaining({ kind: "cost", title: "Transport Cost" }),
      ),
    );
    fireEvent.click(screen.getByRole("button", { name: "Add Expected Recovery" }));
    fireEvent.change(screen.getByLabelText("Space to sell *"), { target: { value: "flats" } });
    expect(screen.getByLabelText("Number of flats to sell *")).toHaveValue(13);
    fireEvent.change(screen.getByLabelText(/Lowest expected selling price/i), {
      target: { value: "5000" },
    });
    fireEvent.change(screen.getByLabelText(/Highest expected selling price/i), {
      target: { value: "7000" },
    });
    for (const account of screen.queryAllByLabelText(/^(Pay from|Receive into) account/))
      fireEvent.change(account, { target: { value: "builder" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(addProjectEstimate).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: "revenue",
          title: "Flats sales",
          recovery_space: "flats",
          recovery_quantity: 13,
          minimum_amount: 65_000,
          maximum_amount: 91_000,
        }),
      ),
    );
  });

  it("calculates flat recovery by floor and room size", async () => {
    vi.mocked(getProjectBuildingDetails).mockResolvedValue({
      id: "building-1",
      project_id: "11111111-1111-4111-8111-111111111111",
      building_use: "residential",
      floors_above_ground: 2,
      basement_count: 0,
      planned_flats: 3,
      planned_shops: null,
      planned_offices: null,
      planned_houses: null,
      planned_parking_spaces: null,
      parking_area_value: null,
      parking_area_unit: null,
      plot_area_value: null,
      plot_area_unit: null,
      covered_area_sqft: null,
      has_masjid: 0,
      selected_spaces_json: '["flats"]',
      floor_layout_json:
        '[{"floor_index":0,"flat_types":[{"rooms":2,"count":2}]},{"floor_index":1,"flat_types":[{"rooms":3,"count":1}]}]',
      notes: null,
      archived: 0,
      custom: "{}",
      created_at: "2026-09-22",
      updated_at: "2026-09-22",
    });
    vi.mocked(addProjectEstimate).mockImplementation(async (value) => ({
      ...value,
      id: "flat-estimate",
      archived: 0,
      custom: JSON.stringify({
        recovery_space: value.recovery_space,
        recovery_quantity: value.recovery_quantity,
        flat_recovery_lines: value.flat_recovery_lines,
      }),
      created_at: "2026-09-22",
      updated_at: "2026-09-22",
    }));
    render(
      <MemoryRouter initialEntries={["/projects/11111111-1111-4111-8111-111111111111"]}>
        <Routes>
          <Route path="/projects/:projectId" element={<ProjectDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );
    fireEvent.click(await screen.findByRole("tab", { name: "Estimate" }));
    fireEvent.click(screen.getByRole("button", { name: "Add Expected Recovery" }));
    fireEvent.change(screen.getByLabelText("Space to sell *"), { target: { value: "flats" } });
    fireEvent.change(screen.getByLabelText("Expected price per flat (Rs) *"), {
      target: { value: "100000" },
    });
    expect(screen.getByText("Rs 300,000 – Rs 300,000")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Customize by floor" }));
    expect(screen.getByText("Ground floor")).toBeInTheDocument();
    expect(screen.getByText("2-room flats")).toBeInTheDocument();
    fireEvent.change(
      screen.getByLabelText("Lowest price per flat (Rs)", { selector: "#flat-min-0" }),
      { target: { value: "100000" } },
    );
    fireEvent.change(
      screen.getByLabelText("Highest price per flat (Rs)", { selector: "#flat-max-0" }),
      { target: { value: "120000" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Next floor" }));
    expect(screen.getByText("Floor 1")).toBeInTheDocument();
    expect(screen.getByText("3-room flats")).toBeInTheDocument();
    fireEvent.change(
      screen.getByLabelText("Lowest price per flat (Rs)", { selector: "#flat-min-1" }),
      { target: { value: "200000" } },
    );
    fireEvent.change(
      screen.getByLabelText("Highest price per flat (Rs)", { selector: "#flat-max-1" }),
      { target: { value: "250000" } },
    );
    for (const account of screen.queryAllByLabelText(/^(Pay from|Receive into) account/))
      fireEvent.change(account, { target: { value: "builder" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(addProjectEstimate).toHaveBeenCalledWith(
        expect.objectContaining({
          recovery_space: "flats",
          recovery_quantity: 3,
          minimum_amount: 400_000,
          maximum_amount: 490_000,
          flat_recovery_lines: expect.arrayContaining([
            expect.objectContaining({
              floor_index: 1,
              rooms: 3,
              quantity: 1,
              minimum_unit_price: 200_000,
            }),
          ]),
        }),
      ),
    );
    fireEvent.click(screen.getByText(/sales estimates and recovery list/));
    expect(screen.getByText("View prices by floor")).toBeInTheDocument();
    fireEvent.click(screen.getByText("View prices by floor"));
    expect(screen.getByText("Floor 1")).toBeInTheDocument();
    fireEvent.click(await screen.findByRole("button", { name: "Edit Flats sales" }));
    fireEvent.click(screen.getByRole("button", { name: "Next floor" }));
    expect(
      screen.getByLabelText("Lowest price per flat (Rs)", { selector: "#flat-min-1" }),
    ).toHaveValue("200000");
  });

  it("adds a project partner with share and dated first payment", async () => {
    render(
      <MemoryRouter initialEntries={["/projects/11111111-1111-4111-8111-111111111111"]}>
        <Routes>
          <Route path="/projects/:projectId" element={<ProjectDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );
    fireEvent.click(await screen.findByRole("tab", { name: "Partners" }));
    fireEvent.click(await screen.findByRole("button", { name: "Add Partner" }));
    fireEvent.change(screen.getByLabelText("Partner name *"), { target: { value: "Ali" } });
    fireEvent.change(screen.getByLabelText("Mobile number *"), {
      target: { value: "03001234567" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.change(screen.getByLabelText("Project share (%) *"), { target: { value: "25.5" } });
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.change(screen.getByLabelText("Amount received (Rs)"), {
      target: { value: "200000" },
    });
    fireEvent.change(screen.getByLabelText("Date received"), { target: { value: "2026-09-22" } });
    for (const account of screen.queryAllByLabelText(/^(Pay from|Receive into) account/))
      fireEvent.change(account, { target: { value: "builder" } });
    fireEvent.click(screen.getByRole("button", { name: "Add Partner" }));
    await waitFor(() =>
      expect(addProjectPartner).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "Ali",
          phone: "03001234567",
          share_bp: 2550,
          initial_amount: 200_000,
          initial_date: "2026-09-22",
        }),
      ),
    );
  });

  it("confirms deletion and removes the item from estimate totals", async () => {
    vi.mocked(listProjectEstimates).mockResolvedValue([
      {
        id: "estimate-1",
        project_id: "11111111-1111-4111-8111-111111111111",
        kind: "cost",
        title: "Cement",
        details: null,
        minimum_amount: 100_000,
        maximum_amount: 150_000,
        archived: 0,
        custom: "{}",
        created_at: "2026-09-22",
        updated_at: "2026-09-22",
      },
    ]);
    render(
      <MemoryRouter initialEntries={["/projects/11111111-1111-4111-8111-111111111111"]}>
        <Routes>
          <Route path="/projects/:projectId" element={<ProjectDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );
    fireEvent.click(await screen.findByRole("tab", { name: "Estimate" }));
    fireEvent.click(screen.getByText(/estimate breakdown and cost list/));
    expect((await screen.findAllByText("Cement")).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "Delete Cement" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("Delete estimate item?");
    fireEvent.click(screen.getByRole("button", { name: "Delete item" }));
    await waitFor(() =>
      expect(archiveProjectEstimate).toHaveBeenCalledWith(
        "11111111-1111-4111-8111-111111111111",
        "estimate-1",
      ),
    );
    await waitFor(() => expect(screen.queryByText("Cement")).not.toBeInTheDocument());
    expect(screen.getByText(/0 items · estimate breakdown and cost list/)).toBeInTheDocument();
  });

  it("prefills an estimate item and updates its displayed amount", async () => {
    const item = {
      id: "estimate-1",
      project_id: "11111111-1111-4111-8111-111111111111",
      kind: "cost" as const,
      title: "Cement",
      details: "20 bags",
      minimum_amount: 100_000,
      maximum_amount: 150_000,
      archived: 0 as const,
      custom: "{}",
      created_at: "2026-09-22",
      updated_at: "2026-09-22",
    };
    vi.mocked(listProjectEstimates).mockResolvedValue([item]);
    vi.mocked(updateProjectEstimate).mockResolvedValue({ ...item, minimum_amount: 120_000 });
    render(
      <MemoryRouter initialEntries={["/projects/11111111-1111-4111-8111-111111111111"]}>
        <Routes>
          <Route path="/projects/:projectId" element={<ProjectDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );
    fireEvent.click(await screen.findByRole("tab", { name: "Estimate" }));
    fireEvent.click(screen.getByText(/estimate breakdown and cost list/));
    fireEvent.click(await screen.findByRole("button", { name: "Edit Cement" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("Edit Expected Cost");
    expect(screen.getByLabelText("Cost item *")).toHaveValue("other");
    expect(screen.getByLabelText("Other cost name *")).toHaveValue("Cement");
    expect(screen.getByLabelText(/Minimum estimate/i)).toHaveValue("100000");
    fireEvent.change(screen.getByLabelText(/Minimum estimate/i), { target: { value: "120000" } });
    for (const account of screen.queryAllByLabelText(/^(Pay from|Receive into) account/))
      fireEvent.change(account, { target: { value: "builder" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(updateProjectEstimate).toHaveBeenCalledWith(
        "estimate-1",
        expect.objectContaining({ minimum_amount: 120_000 }),
      ),
    );
    expect(await screen.findByText("Rs 120,000")).toBeInTheDocument();
  });

  it("shows planned building details and opens them for editing", async () => {
    vi.mocked(getProjectLand).mockResolvedValue({
      id: "land-1",
      title: "Residency plot",
      location: "Quetta",
      purchase_date: "2026-09-22",
      area_value: 2_000,
      area_unit: "sqyd",
      seller_name: "Ali",
      price: 19_000_000,
      notes: "",
    });
    const details = {
      id: "building-1",
      project_id: "11111111-1111-4111-8111-111111111111",
      building_use: "mixed-use" as const,
      floors_above_ground: 5,
      basement_count: 1,
      planned_flats: 12,
      planned_shops: 3,
      planned_offices: 0,
      planned_parking_spaces: null,
      parking_area_value: 800,
      parking_area_unit: "sqyd" as const,
      planned_houses: null,
      has_masjid: 1 as const,
      selected_spaces_json: '["flats","shops","parking","masjid"]',
      floor_layout_json: '[{"floor_index":0,"flat_types":[{"rooms":2,"count":3}]}]',
      plot_area_value: 10,
      plot_area_unit: "marla" as const,
      covered_area_sqft: 18_000,
      covered_area_unit: "sqyd" as const,
      notes: "Ground floor shops",
      archived: 0 as const,
      custom: "{}",
      created_at: "2026-09-22",
      updated_at: "2026-09-22",
    };
    vi.mocked(getProjectBuildingDetails).mockResolvedValue(details);
    vi.mocked(saveProjectBuildingDetails).mockResolvedValue(details);
    render(
      <MemoryRouter initialEntries={["/projects/11111111-1111-4111-8111-111111111111"]}>
        <Routes>
          <Route path="/projects/:projectId" element={<ProjectDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );
    fireEvent.click(await screen.findByRole("tab", { name: "Building" }));
    expect(await screen.findByRole("tab", { name: "At a glance" })).toBeInTheDocument();
    expect(
      screen.getByText(
        "15 planned units across 5 floors. See the breakdown and included facilities below.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Facilities in the plan" })).toBeInTheDocument();
    expect(screen.getByText("800 sq yd planned")).toBeInTheDocument();
    expect(screen.getByText("Prayer space included")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "12 flats, 3 shops" })).toBeInTheDocument();
    expect(screen.getByText("12 of 15 units")).toBeInTheDocument();
    expect(screen.getByText("3 of 15 units")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "Floors & flats" }));
    expect(
      screen.getByRole("img", { name: "5 floors above ground and 1 basement planned" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Floor 1" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Ground floor: 3 2-room flats" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "Areas & details" }));
    expect(screen.getByRole("heading", { name: "Areas & plan details" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Compare area sizes" })).toBeInTheDocument();
    expect(screen.getAllByText("2,000 sq yd").length).toBeGreaterThan(0);
    expect(screen.getByRole("heading", { name: "Land purchase" })).toBeInTheDocument();
    expect(screen.getByText("Ali")).toBeInTheDocument();
    expect(screen.getByText("Rs 19,000,000")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View land records" })).toHaveAttribute(
      "href",
      "/land",
    );
    expect(screen.getByText("Ground floor shops")).toBeInTheDocument();
    expect(screen.queryByText("Planned offices")).not.toBeInTheDocument();
    expect(screen.queryByText("Planned houses")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Edit Details" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("Edit Building Details");
    expect(screen.getByLabelText("Building use")).toHaveValue("mixed-use");
  });

  it("shows received and remaining partner funding in its own tab", async () => {
    vi.mocked(listProjectPartners).mockResolvedValue([
      {
        partnership_id: "share-1",
        partner_id: "partner-1",
        contact_id: "contact-1",
        name: "Ali",
        phone: "03001234567",
        phone2: null,
        address: null,
        notes: null,
        share_bp: 2500,
        agreed_contribution: 500_000,
        contributed: 200_000,
      },
    ]);
    render(
      <MemoryRouter initialEntries={["/projects/11111111-1111-4111-8111-111111111111"]}>
        <Routes>
          <Route path="/projects/:projectId" element={<ProjectDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );
    fireEvent.click(await screen.findByRole("tab", { name: "Partners" }));
    expect(
      screen.getByRole("heading", { name: "Money promised and received" }),
    ).toBeInTheDocument();
    expect(screen.getByText("75.00% still available")).toBeInTheDocument();
    const partnerFilters = screen.getByText("Search & filter partners").closest("details");
    expect(partnerFilters).not.toHaveAttribute("open");
    fireEvent.click(screen.getByText("Search & filter partners"));
    expect(partnerFilters).toHaveAttribute("open");
    expect(screen.getByText("Partly received")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "View Ali's details" })).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: "Ali owns 25.00 percent of this project" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Record Payment" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "View Ali's details" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("Still to receive");
    expect(
      screen.getByRole("img", { name: "Ali: Rs 200,000 received, Rs 300,000 remaining" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Record Payment" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Project estimate" })).not.toBeInTheDocument();
    vi.mocked(updateProjectPartner).mockResolvedValue({
      partnership_id: "share-1",
      partner_id: "partner-1",
      contact_id: "contact-1",
      name: "Ali",
      phone: "03001234567",
      phone2: null,
      address: null,
      notes: null,
      share_bp: 3000,
      agreed_contribution: 600_000,
      contributed: 200_000,
    });
    fireEvent.click(screen.getByRole("button", { name: "Edit Partner" }));
    expect(screen.getByLabelText("Partner name *")).toHaveValue("Ali");
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.change(screen.getByLabelText("Project share (%) *"), { target: { value: "30" } });
    fireEvent.change(screen.getByLabelText("Agreed contribution (Rs)"), {
      target: { value: "600000" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));
    await waitFor(() =>
      expect(updateProjectPartner).toHaveBeenCalledWith(
        expect.objectContaining({
          partnership_id: "share-1",
          share_bp: 3000,
          agreed_contribution: 600_000,
        }),
      ),
    );
  });
});
