import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProjectDetailPage } from "@/features/projects/pages/ProjectDetailPage";
import { getProjectById, updateProjectStatus } from "@/data/repositories/projectsRepository";
import { addProjectEstimate, archiveProjectEstimate, updateProjectEstimate, listProjectEstimates, listActualProjectCosts } from "@/data/repositories/projectFinanceRepository";
import { getProjectBuildingDetails, saveProjectBuildingDetails } from "@/data/repositories/projectBuildingRepository";
import { listProjectPartners, listPartnerContributions, addProjectPartner, addPartnerContribution } from "@/data/repositories/projectPartnersRepository";

vi.mock("@/data/repositories/projectsRepository", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/data/repositories/projectsRepository")>(),
  getProjectById: vi.fn(), updateProjectStatus: vi.fn(),
}));
vi.mock("@/data/repositories/projectFinanceRepository", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/data/repositories/projectFinanceRepository")>(),
  listProjectEstimates: vi.fn(), listActualProjectCosts: vi.fn(), archiveProjectEstimate: vi.fn(), addProjectEstimate: vi.fn(),
  updateProjectEstimate: vi.fn(),
}));
vi.mock("@/data/repositories/projectBuildingRepository", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/data/repositories/projectBuildingRepository")>(),
  getProjectBuildingDetails: vi.fn(), saveProjectBuildingDetails: vi.fn(),
}));
vi.mock("@/data/repositories/projectPartnersRepository", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/data/repositories/projectPartnersRepository")>(),
  listProjectPartners: vi.fn(), listPartnerContributions: vi.fn(),
  addProjectPartner: vi.fn(), addPartnerContribution: vi.fn(),
}));

describe("ProjectDetailPage", () => {
  beforeEach(() => {
    vi.mocked(getProjectById).mockResolvedValue({
      id: "11111111-1111-4111-8111-111111111111", name: "Baloch Residency",
      code: "BR-01", location: "Quetta", description: null, status: "planning",
      start_date: null, archived: 0, custom: "{}", created_at: "2026-09-22",
      updated_at: "2026-09-22",
    });
    vi.mocked(listProjectEstimates).mockResolvedValue([]);
    vi.mocked(listActualProjectCosts).mockResolvedValue([]);
    vi.mocked(archiveProjectEstimate).mockResolvedValue(undefined);
    vi.mocked(getProjectBuildingDetails).mockResolvedValue(null);
    vi.mocked(listProjectPartners).mockResolvedValue([]);
    vi.mocked(listPartnerContributions).mockResolvedValue([]);
    vi.mocked(addProjectPartner).mockResolvedValue(undefined);
    vi.mocked(addPartnerContribution).mockResolvedValue(undefined);
  });

  it("opens on the project dashboard and explains charts without saved data", async () => {
    render(<MemoryRouter initialEntries={["/projects/11111111-1111-4111-8111-111111111111"]}>
      <Routes><Route path="/projects/:projectId" element={<ProjectDetailPage />} /></Routes>
    </MemoryRouter>);
    expect(await screen.findByRole("tab", { name: "Dashboard" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("heading", { name: "Baloch Residency dashboard" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Building mix" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Spending over time" })).toBeInTheDocument();
    expect(screen.getByText(/Record actual project costs to see a line chart/)).toBeInTheDocument();
  });

  it("changes the project status and shows the saved stage", async () => {
    vi.mocked(updateProjectStatus).mockResolvedValue({
      id: "11111111-1111-4111-8111-111111111111", name: "Baloch Residency",
      code: "BR-01", location: "Quetta", description: null, status: "under construction",
      start_date: null, archived: 0, custom: "{}", created_at: "2026-09-22", updated_at: "2026-09-24",
    });
    render(<MemoryRouter initialEntries={["/projects/11111111-1111-4111-8111-111111111111"]}>
      <Routes><Route path="/projects/:projectId" element={<ProjectDetailPage />} /></Routes>
    </MemoryRouter>);
    expect(await screen.findByRole("heading", { name: "Baloch Residency" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Change Status" }));
    fireEvent.change(screen.getByLabelText("Project status"), { target: { value: "under construction" } });
    fireEvent.click(screen.getByRole("button", { name: "Save status" }));
    await waitFor(() => expect(updateProjectStatus).toHaveBeenCalledWith("11111111-1111-4111-8111-111111111111", "under construction"));
    expect(screen.getByText("Quetta")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Project at Construction, stage 3 of 4" })).toBeInTheDocument();
  });

  it("opens the estimate and actual cost entry modals from their tabs", async () => {
    render(<MemoryRouter initialEntries={["/projects/11111111-1111-4111-8111-111111111111"]}>
      <Routes><Route path="/projects/:projectId" element={<ProjectDetailPage />} /></Routes>
    </MemoryRouter>);
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
    expect(screen.getByText(/Add flats, shops, offices or houses in Building Details/)).toBeInTheDocument();
    expect(screen.queryByLabelText("Cost item *")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.click(screen.getByRole("tab", { name: "Actual Cost" }));
    fireEvent.click(screen.getByRole("button", { name: "Add Actual Cost" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("Amount paid");
  });

  it("saves selected and custom costs separately from recovery", async () => {
    vi.mocked(getProjectBuildingDetails).mockResolvedValue({
      id: "building-1", project_id: "11111111-1111-4111-8111-111111111111",
      building_use: "mixed-use", floors_above_ground: 4, basement_count: 0,
      planned_flats: 13, planned_shops: 5, planned_offices: null, planned_houses: null,
      planned_parking_spaces: null, parking_area_value: null, parking_area_unit: null,
      plot_area_value: null, plot_area_unit: null, covered_area_sqft: null,
      has_masjid: 0, selected_spaces_json: '["flats","shops"]', floor_layout_json: "[]",
      notes: null, archived: 0, custom: "{}", created_at: "2026-09-22", updated_at: "2026-09-22",
    });
    vi.mocked(addProjectEstimate).mockImplementation(async (value) => ({
      ...value, id: `estimate-${value.kind}`, archived: 0, custom: "{}",
      created_at: "2026-09-22", updated_at: "2026-09-22",
    }));
    render(<MemoryRouter initialEntries={["/projects/11111111-1111-4111-8111-111111111111"]}>
      <Routes><Route path="/projects/:projectId" element={<ProjectDetailPage />} /></Routes>
    </MemoryRouter>);
    fireEvent.click(await screen.findByRole("tab", { name: "Estimate" }));
    fireEvent.click(screen.getByRole("button", { name: "Add Expected Cost" }));
    fireEvent.change(screen.getByLabelText("Cost item *"), { target: { value: "other" } });
    fireEvent.change(screen.getByLabelText("Other cost name *"), { target: { value: "Transport Cost" } });
    fireEvent.change(screen.getByLabelText(/Minimum estimate/i), { target: { value: "1000" } });
    fireEvent.change(screen.getByLabelText(/Maximum estimate/i), { target: { value: "2000" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(addProjectEstimate).toHaveBeenCalledWith(expect.objectContaining({ kind: "cost", title: "Transport Cost" })));
    fireEvent.click(screen.getByRole("button", { name: "Add Expected Recovery" }));
    fireEvent.change(screen.getByLabelText("Space to sell *"), { target: { value: "flats" } });
    expect(screen.getByLabelText("Number of flats to sell *")).toHaveValue(13);
    fireEvent.change(screen.getByLabelText(/Lowest expected selling price/i), { target: { value: "5000" } });
    fireEvent.change(screen.getByLabelText(/Highest expected selling price/i), { target: { value: "7000" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(addProjectEstimate).toHaveBeenCalledWith(expect.objectContaining({
      kind: "revenue", title: "Flats sales", recovery_space: "flats", recovery_quantity: 13,
      minimum_amount: 65_000, maximum_amount: 91_000,
    })));
  });

  it("calculates flat recovery by floor and room size", async () => {
    vi.mocked(getProjectBuildingDetails).mockResolvedValue({
      id: "building-1", project_id: "11111111-1111-4111-8111-111111111111",
      building_use: "residential", floors_above_ground: 2, basement_count: 0,
      planned_flats: 3, planned_shops: null, planned_offices: null, planned_houses: null,
      planned_parking_spaces: null, parking_area_value: null, parking_area_unit: null,
      plot_area_value: null, plot_area_unit: null, covered_area_sqft: null,
      has_masjid: 0, selected_spaces_json: '["flats"]',
      floor_layout_json: '[{"floor_index":0,"flat_types":[{"rooms":2,"count":2}]},{"floor_index":1,"flat_types":[{"rooms":3,"count":1}]}]',
      notes: null, archived: 0, custom: "{}", created_at: "2026-09-22", updated_at: "2026-09-22",
    });
    vi.mocked(addProjectEstimate).mockImplementation(async (value) => ({
      ...value, id: "flat-estimate", archived: 0, custom: JSON.stringify({ recovery_space: value.recovery_space, recovery_quantity: value.recovery_quantity, flat_recovery_lines: value.flat_recovery_lines }),
      created_at: "2026-09-22", updated_at: "2026-09-22",
    }));
    render(<MemoryRouter initialEntries={["/projects/11111111-1111-4111-8111-111111111111"]}>
      <Routes><Route path="/projects/:projectId" element={<ProjectDetailPage />} /></Routes>
    </MemoryRouter>);
    fireEvent.click(await screen.findByRole("tab", { name: "Estimate" }));
    fireEvent.click(screen.getByRole("button", { name: "Add Expected Recovery" }));
    fireEvent.change(screen.getByLabelText("Space to sell *"), { target: { value: "flats" } });
    expect(screen.getByText("Ground · 2 rooms")).toBeInTheDocument();
    expect(screen.getByText("Floor 1 · 3 rooms")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Lowest price per flat (Rs)", { selector: "#flat-min-0" }), { target: { value: "100000" } });
    fireEvent.change(screen.getByLabelText("Highest price per flat (Rs)", { selector: "#flat-max-0" }), { target: { value: "120000" } });
    fireEvent.change(screen.getByLabelText("Lowest price per flat (Rs)", { selector: "#flat-min-1" }), { target: { value: "200000" } });
    fireEvent.change(screen.getByLabelText("Highest price per flat (Rs)", { selector: "#flat-max-1" }), { target: { value: "250000" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(addProjectEstimate).toHaveBeenCalledWith(expect.objectContaining({
      recovery_space: "flats", recovery_quantity: 3, minimum_amount: 400_000, maximum_amount: 490_000,
      flat_recovery_lines: expect.arrayContaining([expect.objectContaining({ floor_index: 1, rooms: 3, quantity: 1, minimum_unit_price: 200_000 })]),
    })));
    fireEvent.click(await screen.findByRole("button", { name: "Edit Flats sales" }));
    expect(screen.getByLabelText("Lowest price per flat (Rs)", { selector: "#flat-min-1" })).toHaveValue("200000");
  });

  it("adds a project partner with share and dated first payment", async () => {
    render(<MemoryRouter initialEntries={["/projects/11111111-1111-4111-8111-111111111111"]}>
      <Routes><Route path="/projects/:projectId" element={<ProjectDetailPage />} /></Routes>
    </MemoryRouter>);
    fireEvent.click(await screen.findByRole("tab", { name: "Partners" }));
    fireEvent.click(await screen.findByRole("button", { name: "Add Partner" }));
    fireEvent.change(screen.getByLabelText("Partner name *"), { target: { value: "Ali" } });
    fireEvent.change(screen.getByLabelText("Mobile number *"), { target: { value: "03001234567" } });
    fireEvent.change(screen.getByLabelText("Project share (%) *"), { target: { value: "25.5" } });
    fireEvent.change(screen.getByLabelText("Amount received (Rs)"), { target: { value: "200000" } });
    fireEvent.change(screen.getByLabelText("Date received"), { target: { value: "2026-09-22" } });
    fireEvent.click(screen.getByRole("button", { name: "Add Partner" }));
    await waitFor(() => expect(addProjectPartner).toHaveBeenCalledWith(expect.objectContaining({
      name: "Ali", phone: "03001234567", share_bp: 2550,
      initial_amount: 200_000, initial_date: "2026-09-22",
    })));
  });

  it("confirms deletion and removes the item from estimate totals", async () => {
    vi.mocked(listProjectEstimates).mockResolvedValue([{
      id: "estimate-1", project_id: "11111111-1111-4111-8111-111111111111",
      kind: "cost", title: "Cement", details: null, minimum_amount: 100_000,
      maximum_amount: 150_000, archived: 0, custom: "{}", created_at: "2026-09-22",
      updated_at: "2026-09-22",
    }]);
    render(<MemoryRouter initialEntries={["/projects/11111111-1111-4111-8111-111111111111"]}>
      <Routes><Route path="/projects/:projectId" element={<ProjectDetailPage />} /></Routes>
    </MemoryRouter>);
    fireEvent.click(await screen.findByRole("tab", { name: "Estimate" }));
    expect((await screen.findAllByText("Cement")).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "Delete Cement" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("Delete estimate item?");
    fireEvent.click(screen.getByRole("button", { name: "Delete item" }));
    await waitFor(() => expect(archiveProjectEstimate).toHaveBeenCalledWith(
      "11111111-1111-4111-8111-111111111111", "estimate-1"));
    await waitFor(() => expect(screen.queryByText("Cement")).not.toBeInTheDocument());
    expect(screen.getAllByText("Rs 0 – Rs 0")).toHaveLength(2);
  });

  it("prefills an estimate item and updates its displayed amount", async () => {
    const item = {
      id: "estimate-1", project_id: "11111111-1111-4111-8111-111111111111",
      kind: "cost" as const, title: "Cement", details: "20 bags", minimum_amount: 100_000,
      maximum_amount: 150_000, archived: 0 as const, custom: "{}", created_at: "2026-09-22",
      updated_at: "2026-09-22",
    };
    vi.mocked(listProjectEstimates).mockResolvedValue([item]);
    vi.mocked(updateProjectEstimate).mockResolvedValue({ ...item, minimum_amount: 120_000 });
    render(<MemoryRouter initialEntries={["/projects/11111111-1111-4111-8111-111111111111"]}>
      <Routes><Route path="/projects/:projectId" element={<ProjectDetailPage />} /></Routes>
    </MemoryRouter>);
    fireEvent.click(await screen.findByRole("tab", { name: "Estimate" }));
    fireEvent.click(await screen.findByRole("button", { name: "Edit Cement" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("Edit Expected Cost");
    expect(screen.getByLabelText("Cost item *")).toHaveValue("other");
    expect(screen.getByLabelText("Other cost name *")).toHaveValue("Cement");
    expect(screen.getByLabelText(/Minimum estimate/i)).toHaveValue("100000");
    fireEvent.change(screen.getByLabelText(/Minimum estimate/i), { target: { value: "120000" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(updateProjectEstimate).toHaveBeenCalledWith("estimate-1",
      expect.objectContaining({ minimum_amount: 120_000 })));
    expect(await screen.findByText("Rs 120,000")).toBeInTheDocument();
  });

  it("shows planned building details and opens them for editing", async () => {
    const details = {
      id: "building-1", project_id: "11111111-1111-4111-8111-111111111111",
      building_use: "mixed-use" as const, floors_above_ground: 5, basement_count: 1,
      planned_flats: 12, planned_shops: 3, planned_offices: 0, planned_parking_spaces: null,
      parking_area_value: 800, parking_area_unit: "sqyd" as const,
      planned_houses: null, has_masjid: 1 as const,
      selected_spaces_json: '["flats","shops","parking","masjid"]',
      floor_layout_json: '[{"floor_index":0,"flat_types":[{"rooms":2,"count":3}]}]',
      plot_area_value: 10, plot_area_unit: "marla" as const, covered_area_sqft: 18_000,
      notes: "Ground floor shops", archived: 0 as const, custom: "{}",
      created_at: "2026-09-22", updated_at: "2026-09-22",
    };
    vi.mocked(getProjectBuildingDetails).mockResolvedValue(details);
    vi.mocked(saveProjectBuildingDetails).mockResolvedValue(details);
    render(<MemoryRouter initialEntries={["/projects/11111111-1111-4111-8111-111111111111"]}>
      <Routes><Route path="/projects/:projectId" element={<ProjectDetailPage />} /></Routes>
    </MemoryRouter>);
    fireEvent.click(await screen.findByRole("tab", { name: "Building" }));
    expect(await screen.findByRole("tab", { name: "At a glance" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "12 flats, 3 shops" })).toBeInTheDocument();
    expect(screen.getByText("Flats make up the largest part of the plan: 12 of 15 spaces (80%).")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "Floors & flats" }));
    expect(screen.getByRole("img", { name: "5 floors above ground and 1 basement planned" })).toBeInTheDocument();
    expect(screen.getByText("Floor 1")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Ground floor: 3 2-room flats" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "Areas & details" }));
    expect(screen.getByRole("heading", { name: "Area overview" })).toBeInTheDocument();
    expect(screen.getByText("Ground floor shops")).toBeInTheDocument();
    expect(screen.queryByText("Planned offices")).not.toBeInTheDocument();
    expect(screen.queryByText("Planned houses")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Edit Details" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("Edit Building Details");
    expect(screen.getByLabelText("Building use")).toHaveValue("mixed-use");
  });

  it("shows received and remaining partner funding in its own tab", async () => {
    vi.mocked(listProjectPartners).mockResolvedValue([{
      partnership_id: "share-1", partner_id: "partner-1", contact_id: "contact-1",
      name: "Ali", phone: "03001234567", phone2: null, address: null, notes: null,
      share_bp: 2500, agreed_contribution: 500_000, contributed: 200_000,
    }]);
    render(<MemoryRouter initialEntries={["/projects/11111111-1111-4111-8111-111111111111"]}>
      <Routes><Route path="/projects/:projectId" element={<ProjectDetailPage />} /></Routes>
    </MemoryRouter>);
    fireEvent.click(await screen.findByRole("tab", { name: "Partners" }));
    expect(screen.getByRole("heading", { name: "Money promised and received" })).toBeInTheDocument();
    expect(screen.getByText(/of the project share has not been assigned yet/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "View Ali's details" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Ali owns 25.00 percent of this project" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Record Payment" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "View Ali's details" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("Still to receive");
    expect(screen.getByRole("img", { name: "Ali: Rs 200,000 received, Rs 300,000 remaining" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Record Payment" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Project estimate" })).not.toBeInTheDocument();
  });
});
