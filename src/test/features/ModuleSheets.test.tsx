import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { SheetViewButton } from "@/features/sheet/SheetViewButton";
import { contactsSheets, udhaarSheets } from "@/features/sheet/moduleSheets";
import {
  archiveContact,
  createContact,
  listContacts,
  updateContact,
} from "@/data/repositories/contactsRepository";
import { createUdhaar, listUdhaars } from "@/data/repositories/udhaarRepository";
import { archiveUdhaar } from "@/data/repositories/sheetRecordsRepository";

vi.mock("@/data/repositories/contactsRepository", () => ({
  listContacts: vi.fn(),
  createContact: vi.fn(),
  updateContact: vi.fn(),
  archiveContact: vi.fn(),
}));
vi.mock("@/data/repositories/udhaarRepository", async (original) => ({
  ...(await original<typeof import("@/data/repositories/udhaarRepository")>()),
  listUdhaars: vi.fn(),
  listAllUdhaarPayments: vi.fn().mockResolvedValue([]),
  createUdhaar: vi.fn(),
}));
vi.mock("@/data/repositories/sheetRecordsRepository", async (original) => ({
  ...(await original<typeof import("@/data/repositories/sheetRecordsRepository")>()),
  archiveUdhaar: vi.fn(),
  updateSheetUdhaar: vi.fn(),
}));

const contact = {
  id: "c1",
  name: "Ali",
  phone: "0300",
  phone2: null,
  address: "Quetta",
  notes: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  vi.mocked(listContacts).mockResolvedValue([contact] as never);
  vi.mocked(updateContact).mockResolvedValue({} as never);
  vi.mocked(createContact).mockResolvedValue({ id: "c2" } as never);
  vi.mocked(archiveContact).mockResolvedValue();
});

async function openContacts() {
  render(<SheetViewButton title="Contacts sheet" storageId="t" createSheets={contactsSheets} />);
  fireEvent.click(screen.getByRole("button", { name: /Sheet view/ }));
  await waitFor(() => expect(screen.getByLabelText("Name row 1")).toHaveValue("Ali"));
}

it("shows saved contacts, edits one and saves the change", async () => {
  await openContacts();
  fireEvent.change(screen.getByLabelText("Phone row 1"), { target: { value: "0311" } });
  fireEvent.click(screen.getByRole("button", { name: /Save changes/ }));
  await waitFor(() => expect(updateContact).toHaveBeenCalledTimes(1));
  expect(updateContact).toHaveBeenCalledWith(
    expect.objectContaining({ id: "c1", name: "Ali", phone: "0311" }),
  );
  expect(createContact).not.toHaveBeenCalled();
});

it("adds a new contact typed into an empty row", async () => {
  await openContacts();
  fireEvent.change(screen.getByLabelText("Name row 2"), { target: { value: "Bilal" } });
  fireEvent.click(screen.getByRole("button", { name: /Save changes/ }));
  await waitFor(() => expect(createContact).toHaveBeenCalledTimes(1));
  expect(createContact).toHaveBeenCalledWith(expect.objectContaining({ name: "Bilal" }));
});

it("asks before deleting and then removes the saved contact", async () => {
  await openContacts();
  const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValue(true);
  fireEvent.click(screen.getByRole("button", { name: "Delete row 1" }));
  expect(archiveContact).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Delete row 1" }));
  await waitFor(() => expect(archiveContact).toHaveBeenCalledWith("c1"));
  expect(confirm).toHaveBeenCalledTimes(2);
});

it("saves a new udhaar using its returned id", async () => {
  const given = {
    id: "u1",
    borrower_name: "Zain",
    phone: null,
    amount: 1000,
    given_date: "2026-10-01",
    due_date: null,
    notes: null,
    paid_amount: 0,
    payment_count: 0,
    created_at: "x",
    account_key: "personal",
    contact_id: null,
  };
  vi.mocked(listUdhaars)
    .mockResolvedValueOnce([])
    .mockResolvedValueOnce([])
    .mockResolvedValue([given]);
  vi.mocked(createUdhaar).mockResolvedValue("u1");
  render(<SheetViewButton title="Udhaar sheet" storageId="u" createSheets={udhaarSheets} />);
  fireEvent.click(screen.getByRole("button", { name: /Sheet view/ }));
  await screen.findByLabelText("Person row 1");
  fireEvent.change(screen.getByLabelText("Person row 1"), { target: { value: "Zain" } });
  fireEvent.change(screen.getByLabelText("Amount (Rs) row 1"), { target: { value: "1000" } });
  fireEvent.change(screen.getByLabelText("Date given row 1"), { target: { value: "01/10/2026" } });
  fireEvent.change(screen.getByLabelText("Given from row 1"), { target: { value: "personal" } });
  fireEvent.click(screen.getByRole("button", { name: /Save changes/ }));
  await waitFor(() => expect(createUdhaar).toHaveBeenCalledTimes(1));
  expect(createUdhaar).toHaveBeenCalledWith(
    expect.objectContaining({
      borrower_name: "Zain",
      amount: 1000,
      given_date: "2026-10-01",
      account_key: "personal",
    }),
  );
  await screen.findByText(/1 row saved/);
  expect(archiveUdhaar).not.toHaveBeenCalled();
});
