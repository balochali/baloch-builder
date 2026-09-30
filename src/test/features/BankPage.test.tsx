import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { expect, it, vi } from "vitest";
import { BankPage } from "@/features/bank/pages/BankPage";
import { listBankEntries, assignBankAccount } from "@/data/repositories/bankRepository";
vi.mock("@/data/repositories/bankRepository", () => ({ listBankEntries: vi.fn(), assignBankAccount: vi.fn() }));
it("filters accounts and saves a historical payment account", async () => {
  const base = { source: "udhaars", date: "2026-09-30", direction: "out" as const, category: "Udhaar given", person: "Ali", description: "Loan", method: "cash", project: "", project_id: null };
  vi.mocked(listBankEntries).mockResolvedValue([{ ...base, id: "1", source_id: "1", account_key: null, amount: 1000 }, { ...base, id: "2", source_id: "2", account_key: "builder", amount: 2000 }]);
  vi.mocked(assignBankAccount).mockResolvedValue();
  render(<MemoryRouter><BankPage /></MemoryRouter>);
  await screen.findByText(/older transactions have no account/);
  fireEvent.change(screen.getByLabelText("Account"), { target: { value: "unassigned" } });
  expect(screen.getAllByRole("row")).toHaveLength(2);
  fireEvent.change(screen.getByLabelText("Account for Ali on 2026-09-30"), { target: { value: "personal" } });
  await waitFor(() => expect(assignBankAccount).toHaveBeenCalledWith(expect.objectContaining({ source_id: "1" }), "personal"));
});
