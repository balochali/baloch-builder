import { describe, expect, it } from "vitest";
import {
  areaToSqft,
  areaFromSqft,
  projectCreateSchema,
  projectStatuses,
  statusTransitionError,
  settingsSchema,
  defaultSettings,
  costHeadSchema,
} from "./index";
describe("exact area conversion", () => {
  it.each(["sqft", "marla", "kanal"] as const)(
    "round trips %s with regional marla sizes",
    (unit) => {
      for (const size of ["272.25", "225", "250.125"]) {
        expect(areaFromSqft(areaToSqft("123.125", unit, size), unit, size)).toBe("123.125");
      }
    },
  );
  it("preserves amounts beyond binary floating point precision", () => {
    expect(areaToSqft("9007199254740993.125", "marla", "225")).toBe("2026619832316723453.125");
    expect(areaToSqft("1", "kanal")).toBe("5445");
    expect(areaToSqft("0.000000000000000000000001", "sqft")).toBe("0.000000000000000000000001");
  });
  it("rounds only nonterminating display values", () => {
    expect(areaFromSqft("1", "marla", "3")).toBe("0.333333333333");
    expect(areaToSqft("0", "kanal")).toBe("0");
  });
  it.each(["-1", "NaN", "1e3", "1.2.3", ""])("rejects invalid area %s", (value) => {
    expect(() => areaToSqft(value, "sqft")).toThrow();
  });
  it("rejects zero and negative regional factors", () => {
    expect(() => areaToSqft("1", "marla", "0")).toThrow();
    expect(() => areaFromSqft("1", "kanal", "-225")).toThrow();
  });
});
describe("project validation and workflow", () => {
  const base = { code: "AB-12", name: "Tower", type: "apartments", city: "Karachi" };
  it.each(["code", "name", "type", "city"])("requires %s", (field) => {
    expect(projectCreateSchema.safeParse({ ...base, [field]: "" }).success).toBe(false);
  });
  it.each(["a", "bad code", "a".repeat(21)])("rejects invalid code %s", (code) => {
    expect(projectCreateSchema.safeParse({ ...base, code }).success).toBe(false);
  });
  it("validates date ordering and calendar dates", () => {
    expect(projectCreateSchema.safeParse({ ...base, start_date: "2026-02-30" }).success).toBe(
      false,
    );
    expect(
      projectCreateSchema.safeParse({
        ...base,
        start_date: "2026-10-25",
        planned_end_date: "2026-10-24",
      }).success,
    ).toBe(false);
  });
  it("compares exact areas, permits zero and allows plots without covered area", () => {
    expect(
      projectCreateSchema.safeParse({
        ...base,
        covered_area_sqft: "9007199254740993",
        saleable_area_sqft: "9007199254740993.000000000000000000000001",
      }).success,
    ).toBe(false);
    expect(
      projectCreateSchema.safeParse({
        ...base,
        land_area_sqft: "0",
        type: "plots",
        saleable_area_sqft: "1000",
        covered_area_sqft: null,
      }).success,
    ).toBe(true);
    expect(projectCreateSchema.safeParse({ ...base, land_area_sqft: "-1" }).success).toBe(false);
  });
  it("checks every status pair and reserves closing/reopening", () => {
    for (const [i, from] of projectStatuses.entries())
      for (const [j, to] of projectStatuses.entries()) {
        const closed = from === "closed" || to === "closed";
        expect(statusTransitionError(from, to) === null).toBe(!closed && j >= i);
        expect(statusTransitionError(from, to, "Correction after review") === null).toBe(!closed);
      }
    expect(statusTransitionError("sales", "planning", "   ")).toMatch(/reason/);
  });
  it("validates configurable display units without changing stored units", () => {
    expect(
      settingsSchema.parse({ ...defaultSettings, areaDisplayUnit: "kanal", marlaSqft: "225" })
        .areaUnit,
    ).toBe("sqft");
    for (const marlaSqft of ["0", "-1", "1e2"])
      expect(settingsSchema.safeParse({ ...defaultSettings, marlaSqft }).success).toBe(false);
    expect(settingsSchema.safeParse({ ...defaultSettings, marlaPerKanal: "21" }).success).toBe(
      false,
    );
  });
  it("accepts budget-only tags without accounts and rejects privileged metadata", () => {
    expect(
      costHeadSchema.safeParse({ code: "BUFFER", name: "Contingency", budget_only: true }).success,
    ).toBe(true);
    expect(
      costHeadSchema.safeParse({ code: "BUFFER", name: "Contingency", is_system: true }).success,
    ).toBe(false);
  });
});
