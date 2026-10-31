import { expect, it } from "vitest";
import {
  blankWorkbookRow,
  workbookSchemas,
  workbookData,
  estimateCosts,
  salesEstimateTotals,
  sumAreas,
} from "./workbook";
import { formatPKR } from "./money";
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

const shop = {
  unitType: "Shop",
  size: "400",
  sizeUnit: "sq ft",
  units: 12,
  minimumPrice: "5000000",
  maximumPrice: "6500000",
};
it("accepts a unit type with size, count and a price range", () => {
  const parsed = workbookSchemas.sales_estimate.parse(shop);
  expect(parsed.units).toBe(12);
  expect(parsed.notes).toBe("");
});
it("rejects sales rows with no units, a reversed price range or a bad size unit", () => {
  const schema = workbookSchemas.sales_estimate;
  expect(schema.safeParse({ ...shop, units: 0 }).success).toBe(false);
  expect(schema.safeParse({ ...shop, minimumPrice: "7", maximumPrice: "6" }).success).toBe(false);
  expect(schema.safeParse({ ...shop, sizeUnit: "acre" }).success).toBe(false);
  expect(schema.safeParse({ ...shop, minimumPrice: "-1" }).success).toBe(false);
  expect(schema.safeParse({ ...shop, unitType: "  " }).success).toBe(false);
  expect(schema.safeParse({ ...shop, minimumPrice: "5", maximumPrice: "5" }).success).toBe(true);
});
it("blank sales rows start as sq ft with zero units", () => {
  expect(blankWorkbookRow("sales_estimate")).toMatchObject({
    unitType: "",
    size: "0",
    sizeUnit: "sq ft",
    units: "0",
    minimumPrice: "0",
    maximumPrice: "0",
  });
});
it("calculates totals exactly: area in sq ft and price per unit times units", () => {
  const totals = salesEstimateTotals(shop);
  expect(totals.totalArea).toBe("4800");
  expect(formatPKR(totals.minimumTotal)).toContain("60,000,000.00");
  expect(formatPKR(totals.maximumTotal)).toContain("78,000,000.00");
  expect(salesEstimateTotals({ ...shop, size: "1250.5", units: 3 }).totalArea).toBe("3751.5");
  expect(salesEstimateTotals({ ...shop, minimumPrice: "0.10", units: 3 }).minimumTotal).toBe(30n);
});
it("converts other size units to square feet using the project's marla size", () => {
  const area = (sizeUnit: string, size: string, units: number, marla?: string) =>
    salesEstimateTotals({ ...shop, sizeUnit, size, units }, marla).totalArea;
  expect(area("sq yd", "120", 3)).toBe("3240");
  expect(area("marla", "5", 2)).toBe("2722.5");
  expect(area("marla", "5", 2, "225")).toBe("2250");
  expect(area("kanal", "1", 1)).toBe("5445");
  expect(area("sq m", "100", 1)).toBe("1076.39");
});
it("throws on invalid input instead of returning a wrong total", () => {
  expect(() => salesEstimateTotals({ ...shop, size: "abc" })).toThrow();
  expect(() => salesEstimateTotals({ ...shop, units: -2 })).toThrow();
});
it("adds areas exactly without floating point drift", () => {
  expect(sumAreas([])).toBe("0");
  expect(sumAreas(["4800", "2722.5", "0.25"])).toBe("7522.75");
  expect(sumAreas(["0.1", "0.2"])).toBe("0.3");
  expect(() => sumAreas(["12.345"])).toThrow();
});

it("persists flat rooms and explicit total area without multiplying area by units", () => {
  const row = workbookSchemas.sales_estimate.parse({
    unitType: "Flat",
    rooms: 2,
    totalArea: "2400",
    units: 3,
    minimumPrice: "100.10",
    maximumPrice: "200.20",
  });
  expect(row.rooms).toBe(2);
  expect(salesEstimateTotals(row)).toMatchObject({
    totalArea: "2400",
    minimumTotal: 30030n,
    maximumTotal: 60060n,
  });
  expect(workbookSchemas.sales_estimate.safeParse({ ...row, rooms: -1 }).success).toBe(false);
  expect(workbookSchemas.sales_estimate.safeParse({ ...row, totalArea: "abc" }).success).toBe(
    false,
  );
});
