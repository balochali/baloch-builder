import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { EstimateOverview } from "@/features/accounting/EstimateOverview";
import {
  allocation,
  equalPartners,
  overviewTotals,
  sharePoints,
} from "@/features/accounting/estimateOverviewModel";
import { api } from "@/data/api";
vi.mock("@/data/api", () => ({ api: vi.fn() }));
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});
const costs = [{ item: "Land", minimumCost: "100", maximumCost: "160" }];
const sales = [
  {
    id: "saved-sale",
    version: 1,
    unitType: "Shop",
    units: 2,
    minimumPrice: "100",
    maximumPrice: "150",
  },
];
function setup() {
  vi.mocked(api).mockImplementation(async (path, method) =>
    method === "PUT"
      ? { ok: true }
      : path.endsWith("/estimate")
        ? costs
        : path.endsWith("/sales_estimate")
          ? sales
          : path.endsWith("/partners")
            ? []
            : null,
  );
  return render(<EstimateOverview projectId="p1" marlaSqft="272.25" />);
}
it("calculates conservative and optimistic profit, losses and fractional partner shares exactly", () => {
  const total = overviewTotals(costs, sales, "272.25");
  expect(total).toMatchObject({
    minCost: 10000n,
    maxCost: 16000n,
    minSales: 20000n,
    maxSales: 30000n,
    minProfit: 4000n,
    maxProfit: 20000n,
  });
  expect(
    overviewTotals([{ item: "Land", minimumCost: "300", maximumCost: "400" }], sales, "272.25")
      .minProfit,
  ).toBe(-20000n);
  expect(allocation(-20000n, 2500)).toBe(-5000n);
  expect(equalPartners(3).reduce((n, p) => n + sharePoints(p.share)!, 0)).toBe(10000);
  expect(sharePoints("101")).toBeNull();
  expect(
    overviewTotals([{ item: "Bad", minimumCost: "10", maximumCost: "1" }], [], "272.25"),
  ).toMatchObject({ excluded: 1, costCount: 0, salesCount: 0 });
});
it("shows dashboard totals, recalculates shares and saves the personal scenario", async () => {
  const view = setup();
  await screen.findByText("Estimated investment");
  expect(screen.getByText("Rs 40.00")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Add partners" }));
  fireEvent.click(screen.getByRole("button", { name: "Apply equal shares" }));
  expect(screen.getAllByText("Rs 50.00 - Rs 80.00")).toHaveLength(2);
  fireEvent.change(screen.getByLabelText("Partner 1 share"), { target: { value: "60" } });
  expect(screen.getByRole("alert")).toHaveTextContent("cannot exceed 100%");
  expect(screen.getByRole("button", { name: "Save scenario" })).toBeDisabled();
  fireEvent.change(screen.getByLabelText("Partner 2 share"), { target: { value: "40" } });
  expect(screen.getByText("Rs 60.00 - Rs 96.00")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Save scenario" }));
  await screen.findByText("Scenario saved for your account.");
  expect(api).toHaveBeenCalledWith(
    "views/estimate-partner-plan-p1",
    "PUT",
    expect.objectContaining({
      filters: {
        partners: [
          { name: "Partner 1", share: "60" },
          { name: "Partner 2", share: "40" },
        ],
      },
    }),
  );
  view.unmount();
  vi.mocked(api).mockImplementation(async (path) =>
    path.startsWith("views/")
      ? { filters: { partners: [{ name: "Ali", share: "100" }] } }
      : path.endsWith("/estimate")
        ? costs
        : path.endsWith("/sales_estimate")
          ? sales
          : [],
  );
  render(<EstimateOverview projectId="p1" marlaSqft="272.25" />);
  await waitFor(() => expect(screen.getByLabelText("Partner 1 name")).toHaveValue("Ali"));
});
it("does not present a profit forecast when estimates are missing and reports loading failures", async () => {
  vi.mocked(api).mockResolvedValue([]);
  const view = render(<EstimateOverview projectId="p1" marlaSqft="272.25" />);
  await screen.findByText("Save both Cost and Sales estimates to calculate projected profit.");
  expect(screen.getAllByText("Not entered")).toHaveLength(6);
  view.unmount();
  vi.mocked(api).mockRejectedValue(Error("Offline"));
  render(<EstimateOverview projectId="p1" marlaSqft="272.25" />);
  expect(await screen.findByRole("alert")).toHaveTextContent("Offline");
});

it("includes saved API rows with metadata and still excludes genuinely invalid sales", () => {
  const savedCost = {
    id: "cost",
    version: 1,
    item: "Total cost",
    minimumCost: "24780000",
    maximumCost: "24900000",
  };
  const savedSale = {
    id: "sale",
    version: 2,
    unitType: "Shop",
    rooms: 0,
    units: 10,
    totalArea: "200",
    minimumPrice: "4000000",
    maximumPrice: "5000000",
  };
  expect(overviewTotals([savedCost], [savedSale], "272.25")).toMatchObject({
    minSales: 4000000000n,
    maxSales: 5000000000n,
    minProfit: 1510000000n,
    maxProfit: 2522000000n,
    salesCount: 1,
    excluded: 0,
  });
  expect(overviewTotals([savedCost], [{ ...savedSale, units: 0 }], "272.25")).toMatchObject({
    salesCount: 0,
    excluded: 1,
  });
});
