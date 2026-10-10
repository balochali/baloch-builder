import { listContacts } from "@/data/repositories/contactsRepository";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CreditUdhaarPage } from "@/features/udhaar/pages/CreditUdhaarPage";
import {
  addPersonUdhaarPayment,
  createUdhaar,
  listAllUdhaarPayments,
  listUdhaarPayments,
  listUdhaars,
} from "@/data/repositories/udhaarRepository";

vi.mock("@/data/repositories/udhaarRepository", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/data/repositories/udhaarRepository")>()),
  addPersonUdhaarPayment: vi.fn(),
  createUdhaar: vi.fn(),
  listAllUdhaarPayments: vi.fn(),
  listUdhaarPayments: vi.fn(),
  listUdhaars: vi.fn(),
}));

vi.mock("@/data/repositories/contactsRepository", () => ({ listContacts: vi.fn() }));

const record = {
  id: "11111111-1111-4111-8111-111111111111",
  borrower_name: "Ali",
  phone: "03001234567",
  amount: 100_000,
  given_date: "2026-09-01",
  due_date: "2026-10-01",
  notes: null,
  paid_amount: 30_000,
  payment_count: 1,
  created_at: "2026-09-01",
};

describe("CreditUdhaarPage", () => {
  it("shows one person card and all lending and repayment history", async () => {
    vi.mocked(listUdhaars).mockResolvedValue([
      record,
      {
        ...record,
        id: "22222222-2222-4222-8222-222222222222",
        amount: 240000,
        paid_amount: 0,
        payment_count: 0,
        given_date: "2026-09-26",
      },
    ]);
    render(<CreditUdhaarPage />);
    await screen.findByText("Largest amounts still due");
    fireEvent.click(screen.getByRole("tab", { name: /People & balances/ }));
    expect(screen.getAllByRole("button", { name: "View Ali's udhaar" })).toHaveLength(1);
    expect(
      screen.getByText("Rs 3.1 lakh", { selector: ".udhaar-card-amount strong" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "View Ali's udhaar" }));
    expect(screen.getByRole("heading", { name: "Money given & received" })).toBeInTheDocument();
    expect(screen.getAllByText(/Money given ·/)).toHaveLength(2);
    expect(screen.getByText(/Paid back ·/)).toBeInTheDocument();
    expect(screen.queryByLabelText("Record repayment against")).not.toBeInTheDocument();
    for (const account of screen.queryAllByRole("radio", { name: "Builder Account" })) {
      fireEvent.click(account);
      fireEvent.change(screen.getByLabelText("Received by *"), { target: { value: "Ali" } });
    }
    fireEvent.click(screen.getByRole("button", { name: "Record repayment" }));
    fireEvent.change(screen.getByLabelText("Amount received (Rs) *"), {
      target: { value: "200000" },
    });
    for (const account of screen.queryAllByRole("radio", { name: "Builder Account" })) {
      fireEvent.click(account);
      fireEvent.change(screen.getByLabelText("Received by *"), { target: { value: "Ali" } });
    }
    fireEvent.click(screen.getByRole("button", { name: "Save repayment" }));
    await waitFor(() =>
      expect(addPersonUdhaarPayment).toHaveBeenCalledWith(
        expect.objectContaining({ udhaar_id: record.id, amount: 200000 }),
      ),
    );
  });

  it("suggests a saved person, fills their phone and saves the contact link", async () => {
    vi.mocked(listContacts).mockResolvedValue([
      {
        id: "22222222-2222-4222-8222-222222222222",
        name: "Ahmed Khan",
        phone: "03001234567",
        phone2: null,
        address: "Quetta",
        notes: null,
        created_at: "",
        updated_at: "",
        archived: 0,
        custom: "{}",
      },
    ]);
    render(<CreditUdhaarPage />);
    fireEvent.click(screen.getByRole("button", { name: "Give Udhaar" }));
    fireEvent.change(screen.getByLabelText("Person's name *"), { target: { value: "ahm" } });
    fireEvent.click(await screen.findByRole("button", { name: /Ahmed Khan.*03001234567/ }));
    expect(screen.getByLabelText("Person's name *")).toHaveValue("Ahmed Khan");
    expect(screen.getByLabelText("Phone (optional)")).toHaveValue("03001234567");
    expect(screen.getByLabelText("Phone (optional)")).toHaveAttribute("readonly");
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.change(screen.getByLabelText("Amount given (Rs) *"), { target: { value: "50000" } });
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    for (const account of screen.queryAllByRole("radio", { name: "Builder Account" })) {
      fireEvent.click(account);
      fireEvent.change(screen.getByLabelText("Received by *"), { target: { value: "Ali" } });
    }
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.click(screen.getByRole("button", { name: "Save udhaar" }));
    await waitFor(() =>
      expect(createUdhaar).toHaveBeenCalledWith(
        expect.objectContaining({
          contact_id: "22222222-2222-4222-8222-222222222222",
          borrower_name: "Ahmed Khan",
          phone: "03001234567",
        }),
      ),
    );
  });

  it("saves personal payment details for lending and repayment", async () => {
    render(<CreditUdhaarPage />);
    await screen.findByText("Largest amounts still due");
    fireEvent.click(screen.getByRole("button", { name: "Give Udhaar" }));
    fireEvent.change(screen.getByLabelText("Person's name *"), { target: { value: "Ali" } });
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.change(screen.getByLabelText("Amount given (Rs) *"), { target: { value: "5000" } });
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.click(screen.getByRole("radio", { name: "Personal Account" }));
    fireEvent.change(screen.getByLabelText("Received by *"), { target: { value: "Ali" } });
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.click(screen.getByRole("button", { name: "Save udhaar" }));
    await waitFor(() => expect(createUdhaar).toHaveBeenCalledWith(expect.objectContaining({ payment_details: expect.objectContaining({ method: "cash", received_by: "Ali" }) })));
    await waitFor(() => expect(screen.queryByLabelText("Received by *")).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole("tab", { name: /People & balances/ }));
    fireEvent.click(screen.getByRole("button", { name: "View Ali's udhaar" }));
    fireEvent.click(screen.getByRole("button", { name: "Record repayment" }));
    fireEvent.click(screen.getByRole("radio", { name: "Personal Account" }));
    fireEvent.change(screen.getByLabelText("Amount received (Rs) *"), { target: { value: "1000" } });
    fireEvent.click(screen.getByRole("button", { name: "Digital wallet" }));
    fireEvent.change(screen.getByLabelText("Received by *"), { target: { value: "Ahmed" } });
    fireEvent.change(screen.getByLabelText("Wallet / app name *"), { target: { value: "Easypaisa" } });
    fireEvent.click(screen.getByRole("button", { name: "Save repayment" }));
    await waitFor(() => expect(addPersonUdhaarPayment).toHaveBeenCalledWith(expect.objectContaining({ method: "digital", payment_details: expect.objectContaining({ received_by: "Ahmed", provider: "Easypaisa" }) })));
  });

  it("validates each step and preserves values when going back", async () => {
    render(<CreditUdhaarPage />);
    fireEvent.click(screen.getByRole("button", { name: "Give Udhaar" }));
    expect(screen.queryByLabelText("Amount given (Rs) *")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save udhaar" })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Person's name *"), { target: { value: "Ali" } });
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.change(screen.getByLabelText("Amount given (Rs) *"), { target: { value: "-5" } });
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByRole("alert")).toHaveTextContent("positive amount");
    fireEvent.change(screen.getByLabelText("Amount given (Rs) *"), { target: { value: "5000" } });
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByLabelText("Person's name *")).toHaveValue("Ali");
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByLabelText("Amount given (Rs) *")).toHaveValue("5000");
    expect(createUdhaar).not.toHaveBeenCalled();
  });
  beforeEach(() => {
    vi.mocked(listContacts).mockResolvedValue([]);
    vi.mocked(listUdhaars).mockResolvedValue([record]);
    vi.mocked(listUdhaarPayments).mockResolvedValue([
      {
        id: "payment-1",
        udhaar_id: record.id,
        amount: 30_000,
        paid_date: "2026-09-10",
        method: "cash",
        notes: null,
      },
    ]);
    vi.mocked(listAllUdhaarPayments).mockResolvedValue([
      {
        id: "payment-1",
        udhaar_id: record.id,
        amount: 30_000,
        paid_date: "2026-09-10",
        method: "cash",
        notes: null,
      },
    ]);
    vi.mocked(createUdhaar).mockResolvedValue(undefined);
    vi.mocked(addPersonUdhaarPayment).mockResolvedValue(undefined);
  });

  it("shows the balance and records a repayment without allowing overpayment", async () => {
    render(<CreditUdhaarPage />);
    fireEvent.click(await screen.findByRole("tab", { name: /People & balances/ }));
    expect(
      await screen.findByText("Rs 70,000", { selector: ".udhaar-card-amount strong" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "View Ali's udhaar" }));
    expect(
      await screen.findByText("Rs 30,000", { selector: ".udhaar-history strong" }),
    ).toBeInTheDocument();
    for (const account of screen.queryAllByRole("radio", { name: "Builder Account" })) {
      fireEvent.click(account);
      fireEvent.change(screen.getByLabelText("Received by *"), { target: { value: "Ali" } });
    }
    fireEvent.click(screen.getByRole("button", { name: "Record repayment" }));
    fireEvent.change(screen.getByLabelText("Amount received (Rs) *"), {
      target: { value: "80000" },
    });
    for (const account of screen.queryAllByRole("radio", { name: "Builder Account" })) {
      fireEvent.click(account);
      fireEvent.change(screen.getByLabelText("Received by *"), { target: { value: "Ali" } });
    }
    fireEvent.click(screen.getByRole("button", { name: "Save repayment" }));
    expect(screen.getByRole("alert")).toHaveTextContent("cannot exceed Rs 70,000");
    expect(addPersonUdhaarPayment).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Amount received (Rs) *"), {
      target: { value: "20000" },
    });
    for (const account of screen.queryAllByRole("radio", { name: "Builder Account" })) {
      fireEvent.click(account);
      fireEvent.change(screen.getByLabelText("Received by *"), { target: { value: "Ali" } });
    }
    fireEvent.click(screen.getByRole("button", { name: "Save repayment" }));
    await waitFor(() =>
      expect(addPersonUdhaarPayment).toHaveBeenCalledWith(
        expect.objectContaining({ udhaar_id: record.id, amount: 20_000 }),
      ),
    );
  });

  it("adds a new udhaar with person, amount and date", async () => {
    render(<CreditUdhaarPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Give Udhaar" }));
    fireEvent.change(screen.getByLabelText("Person's name *"), { target: { value: "Bilal" } });
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.change(screen.getByLabelText("Amount given (Rs) *"), { target: { value: "50000" } });
    fireEvent.change(screen.getByLabelText("Date given *"), { target: { value: "2026-09-24" } });
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    for (const account of screen.queryAllByRole("radio", { name: "Builder Account" })) {
      fireEvent.click(account);
      fireEvent.change(screen.getByLabelText("Received by *"), { target: { value: "Ali" } });
    }
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.click(screen.getByRole("button", { name: "Save udhaar" }));
    await waitFor(() =>
      expect(createUdhaar).toHaveBeenCalledWith(
        expect.objectContaining({
          borrower_name: "Bilal",
          amount: 50_000,
          given_date: "2026-09-24",
        }),
      ),
    );
  });

  it("shows lakh wording and an exact amount beside the graphical overview", async () => {
    vi.mocked(listUdhaars).mockResolvedValue([
      { ...record, amount: 1_040_000, paid_amount: 100_000 },
    ]);
    vi.mocked(listAllUdhaarPayments).mockResolvedValue([
      {
        id: "payment-1",
        udhaar_id: record.id,
        amount: 100_000,
        paid_date: "2026-09-10",
        method: "cash",
        notes: null,
      },
    ]);
    render(<CreditUdhaarPage />);
    expect((await screen.findAllByText("Rs 10.4 lakh")).length).toBeGreaterThan(0);
    expect(screen.getByText("Rs 10,40,000 in full")).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: "Rs 100,000 paid back and Rs 940,000 still to receive" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Largest amounts still due")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Overview" })).toHaveAttribute("aria-selected", "true");
    fireEvent.click(screen.getByRole("tab", { name: /People & balances/ }));
    expect(screen.getByRole("heading", { name: "People who owe you" })).toBeInTheDocument();
    expect(screen.queryByText("Largest amounts still due")).not.toBeInTheDocument();
  });

  it("filters activity by a custom date range while keeping the end balance accurate", async () => {
    vi.mocked(listUdhaars).mockResolvedValue([
      record,
      {
        ...record,
        id: "older",
        borrower_name: "Bilal",
        amount: 50_000,
        paid_amount: 10_000,
        given_date: "2026-08-15",
      },
    ]);
    vi.mocked(listAllUdhaarPayments).mockResolvedValue([
      {
        id: "payment-1",
        udhaar_id: record.id,
        amount: 30_000,
        paid_date: "2026-09-10",
        method: "cash",
        notes: null,
      },
      {
        id: "payment-2",
        udhaar_id: "older",
        amount: 10_000,
        paid_date: "2026-09-12",
        method: "cash",
        notes: null,
      },
    ]);
    render(<CreditUdhaarPage />);
    expect(await screen.findByRole("group", { name: "Udhaar time period" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Custom" }));
    fireEvent.change(screen.getByLabelText("From date"), { target: { value: "2026-09-01" } });
    fireEvent.change(screen.getByLabelText("To date"), { target: { value: "2026-09-30" } });
    expect(screen.getByText("Given in this period")).toBeInTheDocument();
    expect(
      screen.getByText("Rs 1 lakh", { selector: ".udhaar-summary-given strong" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Rs 40,000", { selector: ".udhaar-summary-paid strong" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Rs 1.1 lakh", { selector: ".udhaar-summary-remaining strong" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: /Rs 100,000 given, Rs 0 paid back/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: "Outstanding balance reached Rs 110,000" }),
    ).toBeInTheDocument();
  });
  it("marks a person overdue when an unpaid balance has passed its due date", async () => {
    vi.mocked(listUdhaars).mockResolvedValue([{ ...record, due_date: "2000-01-01" }]);
    render(<CreditUdhaarPage />);
    await screen.findByText("Largest amounts still due");
    fireEvent.click(screen.getByRole("tab", {name:/People & balances/}));
    expect(screen.getByRole("button", {name:"View Ali's udhaar"})).toHaveTextContent("Overdue");
    fireEvent.click(screen.getByText("Search & filter people"));
    fireEvent.change(screen.getByLabelText("Repayment status"), {target:{value:"Overdue"}});
    expect(screen.getByRole("button", {name:"View Ali's udhaar"})).toBeInTheDocument();
  });

});
