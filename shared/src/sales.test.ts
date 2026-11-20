import { describe, it, expect } from "vitest";
import {
  generateInstallments,
  saleUnitNumbers,
  receiptNumber,
  allocateInstallments,
  agreementStatus,
  amountInWords,
  salesPosting,
  saleAgreementSchema,
} from "./sales";
it("honours an explicit schedule allocation before oldest-first remainder", () => {
  const result = allocateInstallments(
    [
      { id: "first", seq: 1, label: "First", amount: 50, due_date: "2026-01-01" },
      { id: "second", seq: 2, label: "Second", amount: 50, due_date: "2026-02-01" },
    ],
    60,
    "2026-03-01",
    [{ installmentId: "second", amount: 40 }],
  );
  expect(result.map((r) => r.paid)).toEqual([20, 40]);
});
describe("sales calculations", () => {
  it("puts rounding in the last instalment and clamps month ends", () => {
    const r = generateInstallments({
      price: 1000,
      downPayment: 200,
      count: 3,
      firstDueDate: "2026-01-31",
    });
    expect(r.map((x) => x.amount)).toEqual([200, 266, 266, 268]);
    expect(r[1].due_date).toBe("2026-02-28");
    expect(r.reduce((s, x) => s + x.amount, 0)).toBe(1000);
  });
  it("allocates oldest first and marks overdue without mutating input", () => {
    const schedule = [
      { seq: 2, label: "Later", amount: 60, due_date: "2026-03-01" },
      { seq: 1, label: "First", amount: 40, due_date: "2026-01-01" },
    ];
    const result = allocateInstallments(schedule, 50, "2026-02-01");
    expect(result.map((x) => [x.paid, x.status])).toEqual([
      [40, "paid"],
      [10, "partial"],
    ]);
    expect(schedule[0].seq).toBe(2);
    expect(allocateInstallments(schedule, 0, "2026-02-01")[0].status).toBe("overdue");
  });
  it("computes booking threshold and handover independently of full payment", () => {
    const a = {
      total_price: 100,
      received: 24,
      schedule: [{ seq: 1, label: "Full", amount: 100, due_date: "2099-01-01" }],
      handover_date: null,
    };
    expect(agreementStatus(a).unitStatus).toBe("Booked");
    expect(agreementStatus({ ...a, received: 25 }).unitStatus).toBe("Sold");
    expect(agreementStatus({ ...a, received: 100 }).unitStatus).toBe("Fully paid");
    expect(agreementStatus({ ...a, handover_date: "2026-01-01" }).unitStatus).toBe("Handed over");
  });
  it("expresses whole PKR amounts in words", () => {
    expect(amountInWords(120050)).toBe("one lakh twenty thousand fifty Pakistani rupees only");
    expect(amountInWords(0)).toBe("zero Pakistani rupees only");
    expect(() => amountInWords(1.5)).toThrow();
  });
  it("recognizes revenue once in one balanced posting", () => {
    const lines = salesPosting("handover", {
      total_price: 100,
      received: 30,
      customer_party_id: "customer",
      project_id: "project",
    });
    expect(lines.map((x) => [x.accountCode, x.debit, x.credit])).toEqual([
      ["2200", 30, 0],
      ["1100", 70, 0],
      ["4000", 0, 100],
    ]);
    expect(lines.reduce((s, x) => s + x.debit - x.credit, 0)).toBe(0);
  });
  it("rejects a payment plan that differs from the price", () => {
    expect(
      saleAgreementSchema.safeParse({
        unit_id: "00000000-0000-4000-8000-000000000001",
        customer_party_id: "00000000-0000-4000-8000-000000000002",
        agreement_date: "2026-01-01",
        total_price: 100,
        plan_type: "full",
        schedule: [{ seq: 1, label: "Full", amount: 99, due_date: "2026-01-01" }],
      }).success,
    ).toBe(false);
  });
});

it("numbers units per real floor across unit types without embedding floor labels", () => {
  const type = {
    id: "flat",
    count: 4,
    category: "Flat",
    sizeSqft: 900,
    bedrooms: 2,
    bathrooms: 2,
    floorsText: "1st-2nd",
  };
  const units = saleUnitNumbers(
    {
      floors: [{ label: "Ground" }, { label: "1st" }, { label: "2nd" }],
      units: [type, { ...type, id: "office", count: 2 }],
    },
    "A-",
  );
  expect(units.map((u) => u.number)).toEqual([
    "A-101",
    "A-102",
    "A-201",
    "A-202",
    "A-103",
    "A-203",
  ]);
  expect(units.map((u) => u.floor)).toEqual(["1st", "1st", "2nd", "2nd", "1st", "2nd"]);
  expect(receiptNumber("R-00000001")).toBe("R-0001");
  expect(receiptNumber("R-00012345")).toBe("R-12345");
});
