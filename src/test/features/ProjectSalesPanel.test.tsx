import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { ProjectSalesPanel } from "@/features/projects/components/ProjectSalesPanel";
import { addProjectSale, listProjectSales } from "@/data/repositories/projectSalesRepository";
import { listProjectSaleDocuments } from "@/data/repositories/documentsRepository";

vi.mock("@/data/repositories/projectSalesRepository", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/data/repositories/projectSalesRepository")>()),
  addProjectSale: vi.fn(), listProjectSales: vi.fn(),
}));
vi.mock("@/data/repositories/documentsRepository", () => ({
  listProjectSaleDocuments: vi.fn(), saveProjectSaleImage: vi.fn(), readDocumentImage: vi.fn(),
}));

const projectId = "11111111-1111-4111-8111-111111111111";

beforeEach(() => {
  vi.mocked(listProjectSales).mockResolvedValue([]);
  vi.mocked(listProjectSaleDocuments).mockResolvedValue([]);
  vi.mocked(addProjectSale).mockReset();
});

it("records a shop sale with its buyer, floor and agreed price", async () => {
  vi.mocked(addProjectSale).mockImplementation(async (input) => ({ id: "sale-1", ...input, created_at: "2026-10-04", updated_at: "2026-10-04", archived: 0, custom: "{}" }));
  render(<ProjectSalesPanel projectId={projectId} buildingDetails={null} />);
  expect(await screen.findByRole("heading", { name: "No units sold yet" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Record sale" }));
  fireEvent.click(screen.getByRole("button", { name: /ShopNo planned/ }));
  fireEvent.change(screen.getByLabelText(/Shop number/), { target: { value: "S-04" } });
  fireEvent.change(screen.getByLabelText(/Floor \*/), { target: { value: "1" } });
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  fireEvent.change(screen.getByLabelText(/Buyer name/), { target: { value: "Muhammad Ali" } });
  fireEvent.change(screen.getByLabelText(/Agreed price/), { target: { value: "8500000" } });
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  fireEvent.click(screen.getByRole("button", { name: "Save sale" }));
  await waitFor(() => expect(addProjectSale).toHaveBeenCalledWith(expect.objectContaining({
    project_id: projectId, kind: "shop", floor_index: 1, unit_number: "S-04",
    buyer_name: "Muhammad Ali", price: 8_500_000,
  })));
  expect(await screen.findByRole("heading", { name: "Shop S-04" })).toBeInTheDocument();
});
