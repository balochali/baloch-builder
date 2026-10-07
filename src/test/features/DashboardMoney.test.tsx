import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect, vi } from "vitest";
import { DashboardMoney, summarizeMoney } from "@/features/dashboard/pages/DashboardMoney";
import { listBankEntries, type BankEntry } from "@/data/repositories/bankRepository";
vi.mock("@/data/repositories/bankRepository", () => ({ listBankEntries: vi.fn() }));
const entries = [
  {
    id: "1",
    account_key: "builder",
    date: "2026-09-01",
    amount: 500000,
    direction: "in",
    category: "Partner contribution",
    project_id: "p1",
  },
  {
    id: "2",
    account_key: "builder",
    date: "2026-09-02",
    amount: 100000,
    direction: "out",
    category: "Construction payment",
    project_id: "p1",
  },
  {
    id: "3",
    account_key: "builder",
    date: "2026-08-01",
    amount: 50000,
    direction: "out",
    category: "Partner payout",
    project_id: "p1",
  },
  {
    id: "4",
    account_key: "personal",
    date: "2026-09-01",
    amount: 20000,
    direction: "out",
    category: "Personal expense",
    source: "personal_expenses",
  },
  {
    id: "5",
    account_key: null,
    date: "2026-09-01",
    amount: 10000,
    direction: "out",
    category: "Land acquisition",
    source: "land",
  },
  {
    id: "6",
    account_key: "builder",
    date: "2025-10-01",
    amount: 80000,
    direction: "out",
    category: "Construction payment",
    project_id: "p1",
  },
].map((entry) => ({
  source: "transactions",
  source_id: entry.id,
  person: "",
  description: "",
  method: "cash",
  project: "",
  project_id: null,
  ...entry,
})) as BankEntry[];
describe("Dashboard money", () => {
  it("scopes all totals and categories to the chosen account and period", () => {
    const summary = summarizeMoney(entries, "builder", 6);
    expect(summary.incoming).toBe(500000);
    expect(summary.outgoing).toBe(150000);
    expect(summary.categories.map((row) => row.label)).toEqual([
      "Construction payment",
      "Partner payout",
    ]);
    expect(summary.points).toHaveLength(6);
    expect(summarizeMoney(entries, "builder", 12).outgoing).toBe(230000);
    expect(summarizeMoney(entries, "unassigned", 6).outgoing).toBe(10000);
  });
  it("updates the payment list when selecting an account", async () => {
    vi.mocked(listBankEntries).mockResolvedValue(entries);
    render(
      <MemoryRouter>
        <DashboardMoney />
      </MemoryRouter>,
    );
    await screen.findByRole("heading", { name: "Latest payments" });
    fireEvent.click(screen.getByRole("button", { name: "Personal Account" }));
    expect(screen.getByRole("link", { name: /Personal expense/ })).toHaveAttribute(
      "href",
      "/personal-expense",
    );
    expect(screen.queryByRole("link", { name: /Partner payout/ })).not.toBeInTheDocument();
    expect(screen.getByRole("img", { name: /Recorded money/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Show line chart" }));
    expect(screen.getByRole("button", { name: "Show line chart" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });
  it("offers retry instead of displaying zeros after loading fails", async () => {
    vi.mocked(listBankEntries)
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce([]);
    render(
      <MemoryRouter>
        <DashboardMoney />
      </MemoryRouter>,
    );
    expect(await screen.findByRole("alert")).toHaveTextContent("Money records are unavailable");
    expect(screen.queryByText("Money received")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("No payments in this selection")).toBeInTheDocument();
  });
});
