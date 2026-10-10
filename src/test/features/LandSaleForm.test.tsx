import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { LandSaleForm } from "@/features/projects/components/LandSaleForm";
import { recordLandSale } from "@/data/repositories/landSalesRepository";
import { listProjectSales } from "@/data/repositories/projectSalesRepository";
import { saveProjectSaleImage } from "@/data/repositories/documentsRepository";
vi.mock("@/data/repositories/landSalesRepository", async (original) => ({
  ...(await original<typeof import("@/data/repositories/landSalesRepository")>()),
  recordLandSale: vi.fn(),
}));
vi.mock("@/data/repositories/projectSalesRepository", () => ({ listProjectSales: vi.fn() }));
vi.mock("@/data/repositories/documentsRepository", () => ({ saveProjectSaleImage: vi.fn() }));
vi.mock("@/data/repositories/projectsRepository", () => ({ updateProjectStatus: vi.fn() }));
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(listProjectSales).mockResolvedValue([]);
  vi.mocked(recordLandSale).mockResolvedValue();
});
it("collects buyer/payment data and retries failed proof without recording the sale twice", async () => {
  const done = vi.fn().mockResolvedValue(undefined);
  render(
    <LandSaleForm
      projectId="11111111-1111-4111-8111-111111111111"
      acquiredDate="2026-10-01"
      onBusy={vi.fn()}
      onSaved={done}
    />,
  );
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Save sale & mark Land Sold" })).toBeEnabled(),
  );
  fireEvent.change(screen.getByLabelText("Buyer name *"), { target: { value: "Ali" } });
  fireEvent.change(screen.getByLabelText("Sale date *"), { target: { value: "2026-10-10" } });
  fireEvent.change(screen.getByLabelText("Sale price (Rs) *"), { target: { value: "1500000" } });
  fireEvent.change(screen.getByLabelText("Amount received (Rs) *"), {
    target: { value: "1000000" },
  });
  const file = new File(["receipt"], "receipt.png", { type: "image/png" });
  fireEvent.change(screen.getByLabelText(/Add payment proof/), { target: { files: [file] } });
  vi.mocked(saveProjectSaleImage)
    .mockRejectedValueOnce(new Error("Upload failed"))
    .mockResolvedValue({ id: "doc1" } as never);
  fireEvent.click(screen.getByRole("button", { name: "Save sale & mark Land Sold" }));
  await screen.findByText(/Some attachments failed/);
  expect(done).not.toHaveBeenCalled();
  expect(recordLandSale).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole("button", { name: "Retry attachments / finish" }));
  await waitFor(() => expect(done).toHaveBeenCalledOnce());
  expect(recordLandSale).toHaveBeenCalledTimes(1);
  expect(saveProjectSaleImage).toHaveBeenLastCalledWith(
    expect.any(String),
    file,
    "2026-10-10",
    "land_sale_receipt",
  );
});
