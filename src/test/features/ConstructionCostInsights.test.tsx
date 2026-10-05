import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ConstructionCostInsights } from "@/features/projects/components/ConstructionCostInsights";
import type { Transaction } from "@/domain/types";

const costs = [
  { id: "cement-1", date: "2026-09-25", description: "Cement", amount: 50_000, method: "cash" },
  { id: "cement-2", date: "2026-09-27", description: "cement", amount: 30_000, method: "bank" },
  { id: "steel-1", date: "2026-09-28", description: "Steel", amount: 120_000, method: "cash" },
  { id: "old-1", date: "2026-08-10", description: "Cement", amount: 40_000, method: "cash" },
] as Transaction[];

describe("ConstructionCostInsights", () => {
  it("groups item names and lets a bar focus the line chart and payments", () => {
    render(<ConstructionCostInsights costs={costs} />);
    expect(screen.getByRole("img", { name: "All construction items spending rose to Rs 240,000" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Cement.*3 payments/ }));
    expect(screen.getByRole("img", { name: "Cement spending rose to Rs 120,000" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Payments for Cement" })).toBeInTheDocument();
    expect(screen.queryByText("Steel", { selector: ".construction-payment-card strong" })).not.toBeInTheDocument();
  });

  it("filters item bars, trend and payments by the selected dates", () => {
    render(<ConstructionCostInsights costs={costs} />);
    fireEvent.click(screen.getByRole("button", { name: "Custom" }));
    fireEvent.change(screen.getByLabelText("From date"), { target: { value: "2026-09-25" } });
    fireEvent.change(screen.getByLabelText("To date"), { target: { value: "2026-09-27" } });
    expect(screen.getByRole("img", { name: "All construction items spending rose to Rs 80,000" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Cement.*2 payments/ })).toBeInTheDocument();
    expect(screen.queryByText("Steel")).not.toBeInTheDocument();
    expect(screen.getAllByText("Rs 80,000").length).toBeGreaterThan(0);
  });
});
