import { expect, it } from "vitest";
import { workbookSchemas, workbookData, estimateCosts } from "./workbook";
it("requires a buyer for sold flats and rejects negative money", () => {
  expect(workbookSchemas.flats.safeParse({ number: "A1", status: "Sold" }).success).toBe(false);
  expect(
    workbookSchemas.flats.safeParse({ number: "A1", status: "Sold", buyer: "Ali", price: "100" })
      .success,
  ).toBe(true);
  expect(workbookSchemas.partners.safeParse({ name: "Ali", agreed: "-1" }).success).toBe(false);
  expect(workbookSchemas.partners.safeParse({ name: "Ali", share: "101" }).success).toBe(false);
});
it("retains custom estimate values while preserving calculations", () => {
  const row = workbookSchemas.estimate.parse({
    item: "Cement",
    quantity: "2",
    rate: "100",
    custom: { custom_supplier: "ABC" },
  });
  expect(row.custom.custom_supplier).toBe("ABC");
  expect(row.rate).toBe("100");
});

it("saves independent total cost bounds and preserves legacy totals", () => {
  const legacy = { item: "Steel", quantity: "2.5", rate: "100.25" };
  expect(estimateCosts(legacy)).toEqual({ minimumCost: "250.63", maximumCost: "250.63" });
  const data = workbookData("estimate", { ...legacy, minimumCost: "200", maximumCost: "350" });
  const saved = workbookSchemas.estimate.parse(data);
  expect(estimateCosts(saved)).toEqual({ minimumCost: "200", maximumCost: "350" });
  expect(workbookSchemas.estimate.safeParse({ ...data, minimumCost: "-1" }).success).toBe(false);
});
