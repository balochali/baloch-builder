import { beforeEach, describe, expect, it, vi } from "vitest";
import * as client from "@/data/client";
import { AddProjectPartnerSchema, PartnerContributionSchema,
  addProjectPartner, addPartnerContribution, emptyPaymentDetails } from "@/data/repositories/projectPartnersRepository";

const projectId = "11111111-1111-4111-8111-111111111111";
const partnerId = "22222222-2222-4222-8222-222222222222";

const partner = {
  project_id: projectId, name: "Ali", phone: "03001234567", phone2: "", address: "Quetta",
  notes: "", share_bp: 2500, agreed_contribution: 1_000_000,
  initial_amount: 200_000, initial_date: "2026-09-22",
  initial_method: "bank" as const, initial_reference: "TRX-1",
  initial_payment_details: { ...emptyPaymentDetails, from_bank: "HBL", from_account_name: "Ali",
    to_bank: "Meezan", to_account_name: "Project Account", receipt_no: "R-101" },
};

describe("project partners", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("requires the first payment amount and date together", () => {
    expect(AddProjectPartnerSchema.safeParse({ ...partner, initial_date: null }).success).toBe(false);
    expect(AddProjectPartnerSchema.safeParse({ ...partner, initial_amount: null }).success).toBe(false);
    expect(PartnerContributionSchema.safeParse({ project_id: projectId, partner_id: partnerId,
      amount: 10.5, date: "2026-09-22", method: "cash", reference: "", description: "",
      payment_details: emptyPaymentDetails }).success).toBe(false);
  });

  it("requires bank and cheque details for the selected method", () => {
    expect(AddProjectPartnerSchema.safeParse({ ...partner, initial_reference: "" }).success).toBe(false);
    expect(AddProjectPartnerSchema.safeParse({ ...partner,
      initial_payment_details: { ...emptyPaymentDetails, from_bank: "HBL" } }).success).toBe(false);
    const cheque = { project_id: projectId, partner_id: partnerId, amount: 50_000,
      date: "2026-09-22", method: "cheque", reference: "", description: "",
      payment_details: { ...emptyPaymentDetails, from_bank: "HBL", from_account_name: "Ali",
        cheque_no: "12345", cheque_date: "2026-09-20", cheque_payee: "Baloch Builder" } };
    expect(PartnerContributionSchema.safeParse(cheque).success).toBe(true);
    expect(PartnerContributionSchema.safeParse({ ...cheque,
      payment_details: { ...cheque.payment_details, cheque_no: "" } }).success).toBe(false);
  });

  it("rejects partner shares that exceed the remaining project share", async () => {
    vi.spyOn(client, "query").mockResolvedValueOnce([{ share_bp: 8000 }]);
    const execute = vi.spyOn(client, "execute");
    await expect(addProjectPartner(partner)).rejects.toThrow("cannot exceed 100%");
    expect(execute).not.toHaveBeenCalled();
  });

  it("records a partner and first payment as an incoming ledger transaction", async () => {
    vi.spyOn(client, "query").mockResolvedValueOnce([]);
    const execute = vi.spyOn(client, "execute").mockResolvedValue({ rowsAffected: 1 });
    await addProjectPartner(partner);
    expect(execute).toHaveBeenCalledTimes(4);
    expect(execute.mock.calls[2][1]).toContain(2500);
    expect(execute.mock.calls[3][0]).toContain("'partner_contribution'");
    expect(execute.mock.calls[3][1]).toContain(200_000);
    expect(execute.mock.calls[3][1]).toContain("2026-09-22");
    expect(execute.mock.calls[3][1]).toContain(JSON.stringify({ payment_details: partner.initial_payment_details }));
  });

  it("retires new partner records if the first payment fails", async () => {
    vi.spyOn(client, "query").mockResolvedValueOnce([]);
    const execute = vi.spyOn(client, "execute")
      .mockResolvedValueOnce({ rowsAffected: 1 })
      .mockResolvedValueOnce({ rowsAffected: 1 })
      .mockResolvedValueOnce({ rowsAffected: 1 })
      .mockRejectedValueOnce(new Error("Payment write failed"))
      .mockResolvedValue({ rowsAffected: 1 });
    await expect(addProjectPartner(partner)).rejects.toThrow("Payment write failed");
    expect(execute).toHaveBeenCalledTimes(7);
    expect(execute.mock.calls.slice(4).map(([sql]) => String(sql))).toEqual([
      expect.stringContaining("UPDATE partnerships SET archived = 1"),
      expect.stringContaining("UPDATE partners SET archived = 1"),
      expect.stringContaining("UPDATE contacts SET archived = 1"),
    ]);
  });

  it("only records payments for a partner linked to this project", async () => {
    const execute = vi.spyOn(client, "execute").mockResolvedValue({ rowsAffected: 1 });
    const query = vi.spyOn(client, "query").mockResolvedValueOnce([]);
    const payment = { project_id: projectId, partner_id: partnerId, amount: 50_000,
      date: "2026-09-22", method: "bank" as const, reference: "ABC", description: "Second payment",
      payment_details: partner.initial_payment_details };
    await expect(addPartnerContribution(payment)).rejects.toThrow("not part of this project");
    expect(execute).not.toHaveBeenCalled();
    query.mockResolvedValueOnce([{ contact_id: "33333333-3333-4333-8333-333333333333" }]);
    await addPartnerContribution(payment);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(execute.mock.calls[0][1]).toContain(50_000);
    expect(execute.mock.calls[0][1]).toContain("bank");
  });
});
