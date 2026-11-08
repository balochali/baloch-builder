import { formatPKR, formatPercent, parsePKR } from "@/features/projects/feasibilityFormat";
import { feasibilitySchema } from "@baloch/shared";
import { sampleFeasibility } from "@/features/projects/sampleFeasibility";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { ProjectDetail } from "@/features/projects/ProjectDetail";
import { api } from "@/data/api";
import { fireEvent, render, screen, within, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { FeasibilityGrid, numberCell } from "@/features/projects/FeasibilityGrid";
import { calculateFeasibility, defaultFeasibility } from "@/features/projects/feasibilityCalc";

it("calculates asymmetric scenarios, including a blank bound and capital-based share", () => {
  const plan = defaultFeasibility();
  expect(plan.costCategories).toHaveLength(8);
  expect(plan.salesRows).toHaveLength(1);
  plan.costCategories[0].rows[0].minAmount = 1000;
  plan.salesRows[0] = {
    ...plan.salesRows[0],
    count: 2,
    areaSqft: 100,
    minRatePerSqft: 10,
    maxRatePerSqft: 15,
    soldPercent: 50,
  };
  plan.partners = [
    { id: "one", name: "One", contributionType: "Cash", capital: 900 },
    { id: "two", name: "Two", contributionType: "Land", capital: 300, profitSharePercent: 40 },
  ];
  const result = calculateFeasibility(plan);
  expect(result).toMatchObject({
    cost: { min: 1050, max: 1050 },
    value: { min: 2000, max: 3000 },
    expected: { min: 1000, max: 1500 },
    profit: { worst: -50, best: 450 },
    margin: { worst: -5, best: 30 },
    breakEven: { worst: 52.5, best: 35 },
    gap: { min: -150, max: -150 },
    share: 115,
  });
  expect(result.returns[0]).toMatchObject({
    share: 75,
    worst: { gain: -37.5 },
    best: { gain: 337.5, total: 1237.5, roi: 37.5 },
  });
});
it("maps legacy numbers on load and formats and parses PKR and percent values", () => {
  const plan = defaultFeasibility();
  const legacy = {
    ...plan,
    costCategories: [
      {
        id: "cost",
        name: "Land",
        rows: [{ id: "row", item: "Plot", amount: 100, notes: "Keep me" }],
      },
    ],
    salesRows: [
      {
        id: "sale",
        unitType: "Flat",
        count: 1,
        areaSqft: 100,
        ratePerSqft: 200,
        priceOverride: 10000,
        soldPercent: 99.995,
      },
    ],
  };
  const converted = feasibilitySchema.parse(legacy);
  expect(converted.costCategories[0].rows[0]).toMatchObject({
    minAmount: 100,
    maxAmount: 100,
    notes: "Keep me",
  });
  expect(converted.salesRows[0]).toMatchObject({
    minRatePerSqft: 200,
    maxRatePerSqft: 200,
    priceOverride: 10000,
    soldPercent: 100,
  });
  expect(["6.5C", "6.5 c", "15L", "250k", "1.2Ar", "63,750,000"].map(parsePKR)).toEqual([
    65000000, 65000000, 1500000, 250000, 1200000000, 63750000,
  ]);
  expect(parsePKR("6.5xyz")).toBeNaN();
  expect([63750000, 218050000, 100000, 10000000, -120000, 999].map(formatPKR)).toEqual([
    "6.38 C",
    "21.81 C",
    "1 L",
    "1 C",
    "-1.2 L",
    "999",
  ]);
  expect(formatPercent(21.187050359712)).toBe("21.19%");
  expect(formatPercent(5)).toBe("5.00%");
});
it("cancels inline edits and validates a pasted sheet before committing changes", () => {
  const onChange = vi.fn();
  const rows = [{ id: "one", cells: [{ value: "Land" }, numberCell(100)] }];
  render(
    <FeasibilityGrid
      headers={["Item", "Amount"]}
      rows={rows}
      locked={false}
      onChange={onChange}
      onAdd={vi.fn()}
    />,
  );
  const amount = screen.getByRole("textbox", { name: "Amount, row 1" });
  fireEvent.keyDown(amount, { key: "F2" });
  fireEvent.change(amount, { target: { value: "999" } });
  fireEvent.keyDown(amount, { key: "Escape" });
  expect(amount).toHaveValue("100");
  expect(onChange).not.toHaveBeenCalled();
  const item = screen.getByRole("textbox", { name: "Item, row 1" });
  fireEvent.paste(item, {
    clipboardData: { getData: () => ["Structure", "bad"].join(String.fromCharCode(9)) },
  });
  expect(screen.getByRole("alert")).toHaveTextContent("Paste cancelled");
  expect(onChange).not.toHaveBeenCalled();
  const clipboard = [
    ["Structure", "1,500,000"],
    ["Finishing", "250"],
  ]
    .map((row) => row.join(String.fromCharCode(9)))
    .join(String.fromCharCode(10));
  fireEvent.paste(item, { clipboardData: { getData: () => clipboard } });
  expect(onChange).toHaveBeenCalledWith([
    { row: 0, col: 0, value: "Structure" },
    { row: 0, col: 1, value: "1,500,000" },
    { row: 1, col: 0, value: "Finishing" },
    { row: 1, col: 1, value: "250" },
  ]);
});

vi.mock("@/data/api", () => ({ api: vi.fn() }));

it("opens each detail tab and saves, approves and unlocks the plan", async () => {
  let stored = defaultFeasibility();
  vi.mocked(api).mockImplementation(async (url, method, data) => {
    if (url === "projects/partner-options") return [];
    if (url === "projects/P-001")
      return { id: "P-001", name: "Harbour Plaza", status: "Planning", partners: [] };
    if (method === "PUT") {
      const { plan, action } = data as { plan: typeof stored; action: string };
      stored = {
        ...plan,
        status: action === "approve" ? "approved" : "draft",
        updatedAt: new Date().toISOString(),
      };
    }
    return stored;
  });
  render(
    <MemoryRouter initialEntries={["/projects/P-001"]}>
      <Routes>
        <Route path="/projects/:id/:tab?" element={<ProjectDetail role="admin" />} />
      </Routes>
    </MemoryRouter>,
  );
  expect(
    await screen.findByRole("heading", { name: "Overview is being built" }),
  ).toBeInTheDocument();
  const tabs = within(screen.getByRole("navigation", { name: "Project sections" }));
  for (const name of ["Parties", "Documents"]) {
    fireEvent.click(tabs.getByRole("link", { name }));
    expect(
      await screen.findByRole("heading", { name: name + " is being built" }),
    ).toBeInTheDocument();
  }
  fireEvent.click(tabs.getByRole("link", { name: "Feasibility" }));
  const amount = (await screen.findAllByRole("textbox", { name: "Min amount, row 1" }))[0];
  fireEvent.click(amount);
  fireEvent.change(amount, { target: { value: "6.5C" } });
  fireEvent.blur(amount);
  await waitFor(() => expect(stored.costCategories[0].rows[0].minAmount).toBe(65000000), {
    timeout: 3000,
  });
  fireEvent.click(screen.getByRole("button", { name: "Approve baseline" }));
  expect(await screen.findByRole("button", { name: "Unlock to edit" })).toBeEnabled();
  expect(amount).toHaveAttribute("readonly");
  expect(amount).toHaveValue("65,000,000");
  expect(stored.status).toBe("approved");
  fireEvent.click(screen.getByRole("button", { name: "Unlock to edit" }));
  expect(await screen.findByRole("button", { name: "Approve baseline" })).toBeEnabled();
  expect(stored.status).toBe("draft");
  expect(stored.costCategories[0].rows[0].minAmount).toBe(65000000);
});

it("recomputes the sample min/max totals", () => {
  const result = calculateFeasibility(
    feasibilitySchema.parse({ ...sampleFeasibility.feasibility, updatedAt: null }),
  );
  expect(result).toMatchObject({
    cost: { min: 152040000, max: 172095000 },
    units: 19,
    value: { min: 196900000, max: 226150000 },
    expected: { min: 190300000, max: 218050000 },
    profit: { worst: 18205000, best: 66010000 },
    capital: 130000000,
    gap: { min: 22040000, max: 42095000 },
    share: 100,
  });
  expect(result.returns.map(({ worst, best }) => [worst.gain, best.gain])).toEqual([
    [7282000, 26404000],
    [6371750, 23103500],
    [4551250, 16502500],
  ]);
});
