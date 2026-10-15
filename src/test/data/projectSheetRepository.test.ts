import { beforeEach, expect, it, vi } from "vitest";
import * as client from "@/data/client";
import {
  updateSheetCost,
  updateSheetLand,
  updateSheetSale,
  updateSheetLandSale,
} from "@/data/repositories/projectSheetRepository";
import { emptyPaymentDetails } from "@/data/repositories/projectPartnersRepository";
const projectId = "11111111-1111-4111-8111-111111111111";
beforeEach(() => vi.restoreAllMocks());
it("keeps land-sale receipts and bank fields on the existing sale", async () => {
  vi.spyOn(client, "query").mockResolvedValue([{ id: "land-1" }]);
  const execute = vi.spyOn(client, "execute").mockResolvedValue({ rowsAffected: 1 });
  await updateSheetLandSale("sale-1", {
    project_id: projectId,
    buyer_name: "Ali",
    buyer_phone: "",
    buyer_address: "",
    sale_date: "2026-10-14",
    price: 1000,
    received: 500,
    account_key: "builder",
    method: "cash",
    reference: "",
    payment_details: emptyPaymentDetails,
    notes: "",
  });
  expect(execute.mock.calls[0][0]).toContain("json_set(custom, '$.received'");
  expect(execute.mock.calls[0][0]).toContain("AND kind = 'land'");
  expect(execute.mock.calls[0][1]).toEqual(expect.arrayContaining(["sale-1", projectId, 500]));
});
it("rejects a land sale receipt larger than the sale price", async () => {
  const execute = vi.spyOn(client, "execute");
  await expect(
    updateSheetLandSale("sale-1", {
      project_id: projectId,
      buyer_name: "Ali",
      buyer_phone: "",
      buyer_address: "",
      sale_date: "2026-10-14",
      price: 1000,
      received: 1500,
      account_key: "builder",
      method: "cash",
      reference: "",
      payment_details: emptyPaymentDetails,
      notes: "",
    }),
  ).rejects.toThrow();
  expect(execute).not.toHaveBeenCalled();
});
it("scopes cost corrections to the project and transaction type, preserving attachments and other metadata", async () => {
  const execute = vi.spyOn(client, "execute").mockResolvedValue({ rowsAffected: 1 });
  await updateSheetCost(
    "cost-1",
    {
      project_id: projectId,
      date: "2026-10-14",
      amount: 500,
      description: "Cement",
      method: "cash",
      reference: "",
      account_key: "builder",
    },
    "construction_cost",
  );
  const [sql, values] = execute.mock.calls[0];
  expect(sql).toContain("WHERE id = ? AND project_id = ? AND type = ?");
  expect(sql).toContain("json_set(custom");
  expect(sql).not.toContain("receipt_document_id =");
  expect(values).toEqual(
    expect.arrayContaining(["cost-1", projectId, "construction_cost", "builder"]),
  );
});
it("does not accept a missing paying account", async () => {
  const execute = vi.spyOn(client, "execute");
  await expect(
    updateSheetCost(
      "cost-1",
      {
        project_id: projectId,
        date: "2026-10-14",
        amount: 500,
        description: "Cement",
        method: "cash",
        reference: "",
      },
      "construction_cost",
    ),
  ).rejects.toThrow();
  expect(execute).not.toHaveBeenCalled();
});
it("does not change the project or land stage when editing a purchase", async () => {
  const execute = vi.spyOn(client, "execute").mockResolvedValue({ rowsAffected: 1 });
  await updateSheetLand(projectId, "land-1", {
    title: "Plot",
    location: "Quetta",
    purchase_date: "2026-10-14",
    area_value: 100,
    area_unit: "sqyd",
    seller_name: "Ali",
    price: null,
    notes: "",
  });
  expect(execute.mock.calls[0][0]).not.toContain("status =");
  expect(execute.mock.calls[0][1]).toEqual(expect.arrayContaining([projectId, "land-1"]));
});
it("rejects edits when the row does not belong to this project", async () => {
  vi.spyOn(client, "execute").mockResolvedValue({ rowsAffected: 0 });
  await expect(
    updateSheetSale("sale-1", {
      project_id: projectId,
      kind: "flat",
      floor_index: 0,
      unit_number: "A1",
      rooms: 2,
      buyer_name: "Ali",
      buyer_phone: "",
      buyer_address: "",
      sale_date: "2026-10-14",
      price: 500,
      notes: "",
    }),
  ).rejects.toThrow(/no longer available/);
});
