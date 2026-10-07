import { saveAmanatReceipt } from "@/data/repositories/documentsRepository";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { PersonalDepositPage } from "@/features/personal-deposit/PersonalDepositPage";
import {
  listPersonalDeposits,
  savePersonalDeposit,
  addDepositReturn,
  listDepositReturns,
  type PersonalDeposit,
} from "@/data/repositories/personalDepositsRepository";
vi.mock("@/data/repositories/personalDepositsRepository", async (original) => ({
  ...(await original<typeof import("@/data/repositories/personalDepositsRepository")>()),
  listPersonalDeposits: vi.fn(),
  savePersonalDeposit: vi.fn(),
  addDepositReturn: vi.fn(),
  listDepositReturns: vi.fn(),
}));
vi.mock("@/data/repositories/documentsRepository", () => ({
  listAmanatReceipts: vi.fn().mockResolvedValue([]),
  saveAmanatReceipt: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/data/repositories/contactsRepository", () => ({
  listContacts: vi.fn().mockResolvedValue([]),
}));
const record: PersonalDeposit = {
  id: "11111111-1111-4111-8111-111111111111",
  holder_name: "Ahmed",
  phone: "",
  amount: 100000,
  returned_amount: 25000,
  deposit_date: "2026-10-01",
  source: "partner",
  source_details: "Ali’s payment",
  reason: "For safekeeping",
  account_key: "personal",
  method: "cash",
  created_at: "2026-10-01",
};
beforeEach(() => {
  vi.mocked(listPersonalDeposits).mockResolvedValue([record]);
  vi.mocked(savePersonalDeposit).mockResolvedValue(record.id);
  vi.mocked(addDepositReturn).mockResolvedValue(record.id);
  vi.mocked(listDepositReturns).mockResolvedValue([]);
});
it("saves a new Amanat with its source and reason", async () => {
  render(<PersonalDepositPage />);
  await screen.findByRole("heading", { name: "Ahmed" });
  fireEvent.click(screen.getByRole("button", { name: "Add deposit" }));
  const dialog = screen.getByRole("dialog");
  fireEvent.change(within(dialog).getByLabelText(/Who is keeping/), { target: { value: "Bilal" } });
  fireEvent.change(within(dialog).getByLabelText("Amount (Rs) *"), { target: { value: "50000" } });
  fireEvent.change(within(dialog).getByLabelText("Source of money"), {
    target: { value: "partner" },
  });
  fireEvent.change(within(dialog).getByLabelText("Source details *"), {
    target: { value: "Ali’s payment" },
  });
  fireEvent.change(within(dialog).getByLabelText("Reason / note"), { target: { value: "امانت" } });
  fireEvent.change(within(dialog).getByLabelText("Received by *"), { target: { value: "Bilal" } });
  fireEvent.click(within(dialog).getByRole("button", { name: "Save deposit" }));
  await waitFor(() =>
    expect(savePersonalDeposit).toHaveBeenCalledWith(
      expect.objectContaining({
        holder_name: "Bilal",
        amount: 50000,
        reason: "امانت",
        source: "partner",
        source_details: "Ali’s payment",
      }),
      undefined,
    ),
  );
});
it("records a partial return and refreshes the page", async () => {
  render(<PersonalDepositPage />);
  await screen.findByRole("heading", { name: "Ahmed" });
  fireEvent.click(screen.getByRole("button", { name: "Record return" }));
  fireEvent.change(screen.getByLabelText("Returned amount (Rs) *"), { target: { value: "10000" } });
  fireEvent.change(screen.getByLabelText("Received by *"), { target: { value: "Myself" } });
  fireEvent.click(screen.getByRole("button", { name: "Save return" }));
  await waitFor(() =>
    expect(addDepositReturn).toHaveBeenCalledWith(
      expect.objectContaining({ deposit_id: record.id, amount: 10000 }),
    ),
  );
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
});
it("shows fully returned deposits separately and keeps history available", async () => {
  vi.mocked(listPersonalDeposits).mockResolvedValue([
    { ...record, returned_amount: record.amount },
  ]);
  render(<PersonalDepositPage />);
  await screen.findByText("No deposits match this view");
  fireEvent.click(screen.getByRole("button", { name: "Fully returned" }));
  expect(screen.getByRole("heading", { name: "Ahmed" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Record return" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "History" }));
  expect(await screen.findByText("No returns recorded yet.")).toBeInTheDocument();
});

it("retries failed images without recording a second return", async () => {
 vi.mocked(addDepositReturn).mockClear();
 vi.mocked(saveAmanatReceipt).mockRejectedValueOnce(new Error("Disk unavailable")).mockResolvedValue(undefined);
 render(<PersonalDepositPage />);
 await screen.findByRole("heading", {name: "Ahmed"});
 fireEvent.click(screen.getByRole("button", {name: "Record return"}));
 fireEvent.change(screen.getByLabelText("Received by *"), {target: {value: "Myself"}});
 fireEvent.change(screen.getByLabelText("Payment receipt images (optional)"), {target: {files: [new File(["image"], "receipt.png", {type: "image/png"})]}});
 fireEvent.click(screen.getByRole("button", {name: "Save return"}));
 await screen.findByText(/these images could not be saved/);
 fireEvent.click(screen.getByRole("button", {name: "Retry images"}));
 await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
 expect(addDepositReturn).toHaveBeenCalledTimes(1);
 expect(saveAmanatReceipt).toHaveBeenCalledTimes(2);
});
