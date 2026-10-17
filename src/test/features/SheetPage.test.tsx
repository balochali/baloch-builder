import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { SheetPage } from "@/features/sheet/pages/SheetPage";
import { createProject, listProjects } from "@/data/repositories/projectsRepository";
import { addProjectSale } from "@/data/repositories/projectSalesRepository";
import { getProjectLand, saveProjectStage } from "@/data/repositories/projectStageRepository";

vi.mock("@/data/repositories/projectsRepository", () => ({
    listProjects: vi.fn(),
    createProject: vi.fn(),
}));
vi.mock("@/data/repositories/projectSalesRepository", () => ({ addProjectSale: vi.fn() }));
vi.mock("@/data/repositories/projectStageRepository", async (original) => ({
    ...(await original<typeof import("@/data/repositories/projectStageRepository")>()),
    getProjectLand: vi.fn(),
    saveProjectStage: vi.fn(),
}));

const PID = "11111111-1111-4111-8111-111111111111";
const project = { id: PID, name: "Green Heights", location: "Quetta", status: "planning" };
const type = (label: string, value: string) =>
    fireEvent.change(screen.getByLabelText(label), { target: { value } });

beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    vi.mocked(listProjects).mockResolvedValue([project] as never);
    vi.mocked(createProject).mockResolvedValue({} as never);
    vi.mocked(addProjectSale).mockResolvedValue({} as never);
    vi.mocked(getProjectLand).mockResolvedValue(null);
    vi.mocked(saveProjectStage).mockResolvedValue({} as never);
});

it("pastes rows copied from Excel and saves them as projects", async () => {
    render(<SheetPage />);
    const first = await screen.findByLabelText("Project name row 1");
    fireEvent.paste(first, {
        clipboardData: {
            getData: () => "Alpha Tower\tQuetta\tA1\t01/02/2026\tfirst\nBeta Plaza\tKarachi\t\t\t\n",
        },
    });
    expect(screen.getByLabelText("Project name row 2")).toHaveValue("Beta Plaza");
    expect(screen.getByLabelText("Start date row 1")).toHaveValue("01/02/2026");
    fireEvent.click(screen.getByRole("button", { name: "Save projects" }));
    await screen.findByText(/2 rows saved/);
    expect(createProject).toHaveBeenCalledTimes(2);
    expect(createProject).toHaveBeenCalledWith(
        expect.objectContaining({ name: "Alpha Tower", start_date: "2026-02-01", status: "planning" }),
    );
});

it("keeps only the failed rows and explains the problem", async () => {
    render(<SheetPage />);
    await screen.findByLabelText("Project name row 1");
    type("Project name row 1", "Green Heights");
    type("Location / address row 1", "Quetta");
    type("Project name row 2", "New One");
    type("Location / address row 2", "Quetta");
    fireEvent.click(screen.getByRole("button", { name: "Save projects" }));
    await screen.findByText(/1 saved. 1 row need/);
    expect(await screen.findByText(/already exists/)).toBeInTheDocument();
    expect(screen.getByLabelText("Project name row 1")).toHaveValue("Green Heights");
});

it("saves a sold flat against the project typed by name", async () => {
    render(<SheetPage />);
    await screen.findByLabelText("Project name row 1");
    fireEvent.click(screen.getByRole("tab", { name: "Flats & Shops" }));
    await screen.findByLabelText("Project row 1");
    type("Project row 1", "green heights");
    type("Floor row 1", "Ground");
    type("Unit no. row 1", "A-1");
    type("Rooms row 1", "3");
    type("Buyer name row 1", "Ali");
    type("Sale date row 1", "14/10/2026");
    type("Sale price (Rs) row 1", "5,000,000");
    fireEvent.click(screen.getByRole("button", { name: "Save sales" }));
    await waitFor(() => expect(addProjectSale).toHaveBeenCalledTimes(1));
    expect(addProjectSale).toHaveBeenCalledWith(
        expect.objectContaining({
            project_id: PID,
            kind: "flat",
            floor_index: 0,
            rooms: 3,
            sale_date: "2026-10-14",
            price: 5000000,
        }),
    );
    await screen.findByText(/1 row saved/);
});

it("land needs the paying account when a price is typed, and fills sensible defaults", async () => {
    render(<SheetPage />);
    await screen.findByLabelText("Project name row 1");
    fireEvent.click(screen.getByRole("tab", { name: "Land" }));
    await screen.findByLabelText("Project row 1");
    type("Project row 1", "Green Heights");
    type("Purchase date row 1", "01/09/2026");
    type("Seller row 1", "Khan");
    type("Price (Rs) row 1", "9000000");
    fireEvent.click(screen.getByRole("button", { name: "Save land" }));
    const alert = await screen.findByRole("alert");
    expect(within(alert).getByText(/paying account|Personal Account or Builder/)).toBeInTheDocument();
    expect(saveProjectStage).not.toHaveBeenCalled();
    type("Paid from row 1", "Builder");
    fireEvent.click(screen.getByRole("button", { name: "Save land" }));
    await waitFor(() => expect(saveProjectStage).toHaveBeenCalledTimes(1));
    expect(saveProjectStage).toHaveBeenCalledWith(
        PID,
        "land acquired",
        expect.objectContaining({
            title: "Green Heights",
            location: "Quetta",
            account_key: "builder",
            price: 9000000,
            payment_details: expect.objectContaining({ method: "cash", paid_to: "Khan" }),
        }),
    );
});