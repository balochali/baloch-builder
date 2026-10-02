import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PersonalExpensePage } from "@/features/personal-expense/pages/PersonalExpensePage";
import {
  createPersonalExpense,
  listPersonalExpenses,
} from "@/data/repositories/personalExpenseRepository";

vi.mock("@/data/repositories/personalExpenseRepository", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/data/repositories/personalExpenseRepository")>()),
  listPersonalExpenses: vi.fn(),
  createPersonalExpense: vi.fn(),
}));

describe("PersonalExpensePage", () => {
  beforeEach(() => {
    vi.mocked(listPersonalExpenses).mockResolvedValue([
      {
        id: "car-1",
        category: "car",
        item_name: "Family car",
        amount: 200_000,
        purchase_date: "2026-09-05",
        notes: "",
        created_at: "2026-09-05",
      },
      {
        id: "watch-1",
        category: "watch",
        item_name: "Watch",
        amount: 50_000,
        purchase_date: "2026-08-10",
        notes: "",
        created_at: "2026-08-10",
      },
    ]);
  });

  it("walks through purchase, payment and review while preserving entries", async () => {
    vi.mocked(createPersonalExpense).mockResolvedValue();
    render(<PersonalExpensePage />);
    await screen.findByRole("heading", { name: "Where your money went" });
    fireEvent.click(screen.getByRole("button", { name: "Add purchase" }));
    expect(screen.queryByLabelText("Amount paid (Rs) *")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save purchase" })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Car name or details *"), {
      target: { value: "Corolla" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.change(screen.getByLabelText("Amount paid (Rs) *"), { target: { value: "500000" } });
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByLabelText("Car name or details *")).toHaveValue("Corolla");
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByLabelText("Amount paid (Rs) *")).toHaveValue("500000");
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.change(screen.getByLabelText(/Pay from account/), { target: { value: "personal" } });
    fireEvent.change(screen.getByLabelText("How was it paid? *"), { target: { value: "digital" } });
    fireEvent.change(screen.getByLabelText("Received by *"), { target: { value: "Ali" } });
    fireEvent.change(screen.getByLabelText("Wallet / app name *"), {
      target: { value: "JazzCash" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText(/Step 4 of 4/)).toBeInTheDocument();
    expect(createPersonalExpense).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Save purchase" }));
    await waitFor(() =>
      expect(createPersonalExpense).toHaveBeenCalledWith(
        expect.objectContaining({
          item_name: "Corolla",
          amount: 500000,
          account_key: "personal",
          payment_details: expect.objectContaining({
            method: "digital",
            provider: "JazzCash",
            received_by: "Ali",
          }),
        }),
      ),
    );
  });

  it("asks for an account before reviewing the purchase", async () => {
    render(<PersonalExpensePage />);
    await screen.findByRole("heading", { name: "Where your money went" });
    fireEvent.click(screen.getByRole("button", { name: "Add purchase" }));
    fireEvent.change(screen.getByLabelText("Car name or details *"), { target: { value: "Car" } });
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.change(screen.getByLabelText("Amount paid (Rs) *"), { target: { value: "500000" } });
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Choose the account used for this purchase.",
    );
    expect(screen.getByText(/Step 3 of 4/)).toBeInTheDocument();
  });

  it("shares category filters across charts, purchases and payments", async () => {
    render(<PersonalExpensePage />);
    await screen.findByRole("heading", { name: "Where your money went" });
    fireEvent.change(screen.getByLabelText("Category"), { target: { value: "Cars" } });
    expect(screen.getByRole("img", { name: "Spending rose to Rs 200,000" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "Payments" }));
    expect(screen.getByRole("heading", { name: "Payment history" })).toBeInTheDocument();
    expect(screen.getByText("Family car")).toBeInTheDocument();
    expect(screen.queryByText("Watch", { selector: "strong" })).not.toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole("tab", { name: "Payments" }), { key: "ArrowRight" });
    expect(screen.getByRole("tab", { name: "Overview" })).toHaveAttribute("aria-selected", "true");
  });
  it("filters totals, charts and purchases by the same custom dates", async () => {
    render(<PersonalExpensePage />);
    expect(
      await screen.findByRole("heading", { name: "Where your money went" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Spending rose to Rs 250,000" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Custom" }));
    fireEvent.change(screen.getByLabelText("From date"), { target: { value: "2026-09-01" } });
    fireEvent.change(screen.getByLabelText("To date"), { target: { value: "2026-09-30" } });
    expect(screen.getByText("Spent in this period")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Spending rose to Rs 200,000" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Cars: Rs 200,000" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: /Purchases/ }));
    expect(screen.getByText("Family car")).toBeInTheDocument();
    expect(
      screen.queryByText("Watch", { selector: ".expense-item-info strong" }),
    ).not.toBeInTheDocument();
  });
  it("opens a recent purchase for editing with its saved details", async () => {
    render(<PersonalExpensePage />);
    const recent = await screen.findByRole("region", { name: "Recent purchases" });
    const rows = recent.querySelectorAll(".expense-recent-row");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveAccessibleName("Edit Family car");
    fireEvent.click(screen.getByRole("button", { name: "Edit Family car" }));
    expect(screen.getByRole("heading", { name: "Edit purchase" })).toBeInTheDocument();
    expect(screen.getByLabelText("Car name or details *")).toHaveValue("Family car");
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByLabelText("Amount paid (Rs) *")).toHaveValue("200000");
  });
});
