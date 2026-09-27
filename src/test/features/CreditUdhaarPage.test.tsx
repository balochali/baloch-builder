import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CreditUdhaarPage } from "@/features/udhaar/pages/CreditUdhaarPage";
import { addUdhaarPayment, createUdhaar, listAllUdhaarPayments, listUdhaarPayments, listUdhaars } from "@/data/repositories/udhaarRepository";

vi.mock("@/data/repositories/udhaarRepository", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/data/repositories/udhaarRepository")>(),
  addUdhaarPayment: vi.fn(), createUdhaar: vi.fn(), listAllUdhaarPayments: vi.fn(), listUdhaarPayments: vi.fn(), listUdhaars: vi.fn(),
}));

const record = {
  id: "11111111-1111-4111-8111-111111111111", borrower_name: "Ali", phone: "03001234567",
  amount: 100_000, given_date: "2026-09-01", due_date: "2026-10-01", notes: null,
  paid_amount: 30_000, payment_count: 1, created_at: "2026-09-01",
};

describe("CreditUdhaarPage", () => {
  beforeEach(() => {
    vi.mocked(listUdhaars).mockResolvedValue([record]);
    vi.mocked(listUdhaarPayments).mockResolvedValue([{ id: "payment-1", udhaar_id: record.id,
      amount: 30_000, paid_date: "2026-09-10", method: "cash", notes: null }]);
    vi.mocked(listAllUdhaarPayments).mockResolvedValue([{ id: "payment-1", udhaar_id: record.id,
      amount: 30_000, paid_date: "2026-09-10", method: "cash", notes: null }]);
    vi.mocked(createUdhaar).mockResolvedValue(undefined);
    vi.mocked(addUdhaarPayment).mockResolvedValue(undefined);
  });

  it("shows the balance and records a repayment without allowing overpayment", async () => {
    render(<CreditUdhaarPage />);
    fireEvent.click(await screen.findByRole("tab", { name: /People & balances/ }));
    expect(await screen.findByText("Rs 70,000", { selector: ".udhaar-card-amount strong" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "View Ali's udhaar" }));
    expect(await screen.findByText("Rs 30,000", { selector: ".udhaar-history strong" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Record repayment" }));
    fireEvent.change(screen.getByLabelText("Amount received (Rs) *"), { target: { value: "80000" } });
    fireEvent.click(screen.getByRole("button", { name: "Save repayment" }));
    expect(screen.getByRole("alert")).toHaveTextContent("cannot exceed Rs 70,000");
    expect(addUdhaarPayment).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Amount received (Rs) *"), { target: { value: "20000" } });
    fireEvent.click(screen.getByRole("button", { name: "Save repayment" }));
    await waitFor(() => expect(addUdhaarPayment).toHaveBeenCalledWith(expect.objectContaining({ udhaar_id: record.id, amount: 20_000 })));
  });

  it("adds a new udhaar with person, amount and date", async () => {
    render(<CreditUdhaarPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Give Udhaar" }));
    fireEvent.change(screen.getByLabelText("Person's name *"), { target: { value: "Bilal" } });
    fireEvent.change(screen.getByLabelText("Amount given (Rs) *"), { target: { value: "50000" } });
    fireEvent.change(screen.getByLabelText("Date given *"), { target: { value: "2026-09-24" } });
    fireEvent.click(screen.getByRole("button", { name: "Save udhaar" }));
    await waitFor(() => expect(createUdhaar).toHaveBeenCalledWith(expect.objectContaining({ borrower_name: "Bilal", amount: 50_000, given_date: "2026-09-24" })));
  });

  it("shows lakh wording and an exact amount beside the graphical overview", async () => {
    vi.mocked(listUdhaars).mockResolvedValue([{ ...record, amount: 1_040_000, paid_amount: 100_000 }]);
    vi.mocked(listAllUdhaarPayments).mockResolvedValue([{ id: "payment-1", udhaar_id: record.id,
      amount: 100_000, paid_date: "2026-09-10", method: "cash", notes: null }]);
    render(<CreditUdhaarPage />);
    expect((await screen.findAllByText("Rs 10.4 lakh")).length).toBeGreaterThan(0);
    expect(screen.getByText("Rs 10,40,000 in full")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Rs 100,000 paid back and Rs 940,000 still to receive" })).toBeInTheDocument();
    expect(screen.getByText("Largest amounts still due")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Overview" })).toHaveAttribute("aria-selected", "true");
    fireEvent.click(screen.getByRole("tab", { name: /People & balances/ }));
    expect(screen.getByRole("heading", { name: "People who owe you" })).toBeInTheDocument();
    expect(screen.queryByText("Largest amounts still due")).not.toBeInTheDocument();
  });

  it("filters activity by a custom date range while keeping the end balance accurate", async () => {
    vi.mocked(listUdhaars).mockResolvedValue([record, { ...record, id: "older", borrower_name: "Bilal",
      amount: 50_000, paid_amount: 10_000, given_date: "2026-08-15" }]);
    vi.mocked(listAllUdhaarPayments).mockResolvedValue([{ id: "payment-1", udhaar_id: record.id,
      amount: 30_000, paid_date: "2026-09-10", method: "cash", notes: null },
      { id: "payment-2", udhaar_id: "older", amount: 10_000, paid_date: "2026-09-12", method: "cash", notes: null }]);
    render(<CreditUdhaarPage />);
    expect(await screen.findByRole("group", { name: "Udhaar time period" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Custom" }));
    fireEvent.change(screen.getByLabelText("From date"), { target: { value: "2026-09-01" } });
    fireEvent.change(screen.getByLabelText("To date"), { target: { value: "2026-09-30" } });
    expect(screen.getByText("Given in this period")).toBeInTheDocument();
    expect(screen.getByText("Rs 1 lakh", { selector: ".udhaar-summary-given strong" })).toBeInTheDocument();
    expect(screen.getByText("Rs 40,000", { selector: ".udhaar-summary-paid strong" })).toBeInTheDocument();
    expect(screen.getByText("Rs 1.1 lakh", { selector: ".udhaar-summary-remaining strong" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /Rs 100,000 given, Rs 0 paid back/ })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Outstanding balance reached Rs 110,000" })).toBeInTheDocument();
  });
});
