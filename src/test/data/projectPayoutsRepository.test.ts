import { beforeEach, describe, expect, it, vi } from "vitest";
import * as client from "@/data/client";
import { addPartnerPayout, listPartnerPayouts, PartnerPayoutSchema } from "@/data/repositories/projectPayoutsRepository";

const project_id = "11111111-1111-4111-8111-111111111111";
const partner_id = "22222222-2222-4222-8222-222222222222";
const input = { project_id, partner_id, amount: 50_000, date: "2026-10-05", purpose: "profit" as const,
  account_key: "builder" as const, method: "bank" as const, reference: "TRX-10", notes: "First profit payout" };

describe("partner payouts", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("rejects invalid or zero payments", () => {
    expect(PartnerPayoutSchema.safeParse({ ...input, amount: 0 }).success).toBe(false);
    expect(PartnerPayoutSchema.safeParse({ ...input, date: "2026-02-30" }).success).toBe(false);
  });

  it("records an outgoing payout attached to a current project partner", async () => {
    vi.spyOn(client, "query").mockResolvedValue([{ contact_id: "contact-1" }]);
    const execute = vi.spyOn(client, "execute").mockResolvedValue({ rowsAffected: 1 });
    await addPartnerPayout(input);
    expect(execute).toHaveBeenCalledWith(expect.stringContaining("'partner_payout'"),
      expect.arrayContaining([project_id, partner_id, 50_000, "builder", "contact-1", '{"purpose":"profit"}']));
  });

  it("refuses to pay someone who is not an active project partner", async () => {
    vi.spyOn(client, "query").mockResolvedValue([]);
    const execute = vi.spyOn(client, "execute");
    await expect(addPartnerPayout(input)).rejects.toThrow("Partner is not part of this project");
    expect(execute).not.toHaveBeenCalled();
  });

  it("lists only active outgoing payouts for this project", async () => {
    const query = vi.spyOn(client, "query").mockResolvedValue([]);
    await listPartnerPayouts(project_id);
    expect(query).toHaveBeenCalledWith(expect.stringContaining("t.type = 'partner_payout'"), [project_id]);
    expect(query.mock.calls[0][0]).toContain("t.archived = 0");
  });
});
