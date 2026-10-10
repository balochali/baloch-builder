import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { expect, it, vi } from "vitest";
import { BankPage } from "@/features/bank/pages/BankPage";
import { listBankEntries, assignBankAccount } from "@/data/repositories/bankRepository";
import { listBankPaymentReceipts } from "@/data/repositories/documentsRepository";
vi.mock("@/data/repositories/bankRepository", () => ({
  listBankEntries: vi.fn(),
  assignBankAccount: vi.fn(),
}));
vi.mock("@/data/repositories/documentsRepository", () => ({
  listBankPaymentReceipts: vi.fn().mockResolvedValue([]),
  readDocumentImage: vi.fn().mockRejectedValue(new Error("Preview unavailable in test")),
}));
it("shows bank insights and read-only transaction accounts", async () => {
  const base = {
    source: "udhaars",
    date: "2026-09-30",
    direction: "out" as const,
    category: "Udhaar given",
    person: "Ali",
    description: "Loan",
    method: "cash",
    project: "",
    project_id: null,
  };
  vi.mocked(listBankEntries).mockResolvedValue([
    { ...base, id: "1", source_id: "1", account_key: null, amount: 1000 },
    { ...base, id: "2", source_id: "2", account_key: "builder", amount: 2000 },
  ]);
  vi.mocked(assignBankAccount).mockResolvedValue();
  render(
    <MemoryRouter>
      <BankPage />
    </MemoryRouter>,
  );
  expect(await screen.findByRole("heading", { name: "Money flow over time" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("tab", { name: /Transactions/ }));
  expect(screen.getByText(/older transaction has no account/)).toBeInTheDocument();
  fireEvent.change(screen.getByRole("textbox", { name: "Search bank transactions" }), {
    target: { value: "nothing" },
  });
  expect(screen.getByText("No transactions match these filters.")).toBeInTheDocument();
  fireEvent.change(screen.getByRole("textbox", { name: "Search bank transactions" }), {
    target: { value: "" },
  });
  fireEvent.click(screen.getByRole("button", { name: /Unassigned/ }));
  expect(screen.getAllByRole("row")).toHaveLength(2);
  expect(screen.queryByLabelText("Account for Ali on 2026-09-30")).not.toBeInTheDocument();
  expect(assignBankAccount).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", {name:"Print statement"}));
  expect(screen.getByRole("dialog")).toBeInTheDocument();
  expect(screen.getByRole("checkbox", {name:"Personal"})).toBeChecked();
  fireEvent.click(screen.getByRole("button", {name:"Preview statement"}));
  expect(screen.getByTitle("Bank statement preview")).toHaveAttribute("srcdoc",expect.stringContaining("Bank & accounts statement"));
});

it("shows saved land purchase payment details in transaction history", async () => {
  vi.mocked(listBankEntries).mockResolvedValue([
    {
      id: "land:1",
      source: "land",
      source_id: "1",
      account_key: "builder",
      date: "2026-10-03",
      amount: 32_000_000,
      direction: "out",
      category: "Land acquisition",
      person: "Muhammad Murad",
      description: "Baloch Residency",
      method: "bank",
      project: "Baloch Residency",
      project_id: "project-1",
      payment_details: JSON.stringify({
        method: "bank",
        paid_to: "Muhammad Murad",
        provider: "Meezan Bank",
        account_name: "Baloch Builders",
        account_no: "1234",
        reference: "TRX-42",
        cheque_date: "",
      }),
    },
  ]);
  render(
    <MemoryRouter>
      <BankPage />
    </MemoryRouter>,
  );
  await screen.findByRole("heading", { name: "Money flow over time" });
  fireEvent.click(screen.getByRole("tab", { name: /Transactions/ }));
  fireEvent.click(screen.getByText("Payment details"));
  expect(screen.getByText("Meezan Bank")).toBeInTheDocument();
  expect(screen.getByText("TRX-42")).toBeInTheDocument();
  expect(screen.getAllByText("Muhammad Murad").length).toBeGreaterThan(0);
});

it("shows receipt previews alongside Bank transactions", async () => {
  vi.mocked(listBankEntries).mockResolvedValue([{
    id: "land:1", source: "land", source_id: "1", account_key: "builder",
    date: "2026-10-03", amount: 5000, direction: "out", category: "Land acquisition",
    person: "Murad", description: "Plot", method: "cash", project: "Baloch Residency",
    project_id: "project-1", payment_details: null,
  }]);
  vi.mocked(listBankPaymentReceipts).mockResolvedValue([{
    id: "receipt-1", title: "cash-receipt.png", doc_type: "land_payment_receipt",
    doc_date: "2026-10-03", notes: "cash", file_path: "C:/attachments/cash-receipt.png",
    mime: "image/png", size: 10, owner_type: "land", owner_id: "1",
    project_name: "Baloch Residency", created_at: "2026-10-03",
  }]);
  render(<MemoryRouter><BankPage /></MemoryRouter>);
  await screen.findByRole("heading", { name: "Money flow over time" });
  expect(screen.queryByRole("tab", { name: "Images" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("tab", { name: /Transactions/ }));
  await waitFor(() => expect(screen.getAllByText("cash-receipt.png").length).toBeGreaterThan(0));
  expect(screen.getByRole("button", { name: /cash-receipt.png/ })).toBeInTheDocument();
});

