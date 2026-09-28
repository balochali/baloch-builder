import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PersonalExpensePage } from "@/features/personal-expense/pages/PersonalExpensePage";
import { listPersonalExpenses } from "@/data/repositories/personalExpenseRepository";

vi.mock("@/data/repositories/personalExpenseRepository", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/data/repositories/personalExpenseRepository")>(),
  listPersonalExpenses: vi.fn(),
}));

describe("PersonalExpensePage", () => {
  beforeEach(() => {
    vi.mocked(listPersonalExpenses).mockResolvedValue([
      { id: "car-1", category: "car", item_name: "Family car", amount: 200_000,
        purchase_date: "2026-09-05", notes: "", created_at: "2026-09-05" },
      { id: "watch-1", category: "watch", item_name: "Watch", amount: 50_000,
        purchase_date: "2026-08-10", notes: "", created_at: "2026-08-10" },
    ]);
  });

  it("filters totals, charts and purchases by the same custom dates", async () => {
    render(<PersonalExpensePage />);
    expect(await screen.findByRole("heading", { name: "Where your money went" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Spending rose to Rs 250,000" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Custom" }));
    fireEvent.change(screen.getByLabelText("From date"), { target: { value: "2026-09-01" } });
    fireEvent.change(screen.getByLabelText("To date"), { target: { value: "2026-09-30" } });
    expect(screen.getByText("Spent in this period")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Spending rose to Rs 200,000" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Cars: Rs 200,000" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: /Purchases/ }));
    expect(screen.getByText("Family car")).toBeInTheDocument();
    expect(screen.queryByText("Watch", { selector: ".expense-item-info strong" })).not.toBeInTheDocument();
  });
});
