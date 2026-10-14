import { expect, it } from "vitest";
import {
    parseAreaUnit,
    parseDate,
    parseFloor,
    parseKind,
    parseWhole,
} from "@/features/sheet/sheetParsing";

it("reads dates the way people write them in Pakistan", () => {
    expect(parseDate("14/10/2026")).toBe("2026-10-14");
    expect(parseDate("4-3-2026")).toBe("2026-03-04");
    expect(parseDate("2026-10-14")).toBe("2026-10-14");
    expect(parseDate("31/02/2026")).toBeNull();
    expect(parseDate("hello")).toBeNull();
    expect(parseDate("46309")).toBe("2026-10-14"); // Excel date number
});
it("reads amounts, floors, types and area units", () => {
    expect(parseWhole("Price", "Rs. 5,000,000")).toBe(5000000);
    expect(parseWhole("Price", "")).toBeNull();
    expect(() => parseWhole("Price", "50 lakh")).toThrow(/whole number/);
    expect(parseFloor("Ground")).toBe(0);
    expect(parseFloor("2nd floor")).toBe(2);
    expect(() => parseFloor("")).toThrow();
    expect(parseKind("")).toBe("flat");
    expect(parseKind("SHOP")).toBe("shop");
    expect(parseAreaUnit("Sq ft")).toBe("sqft");
    expect(parseAreaUnit("Canal")).toBe("kanal");
});