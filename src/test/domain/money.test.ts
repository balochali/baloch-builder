import { describe, it, expect } from "vitest";
import { parseAmount, formatPKR, formatCompact } from "@/domain/money";

describe("domain/money", () => {
  describe("parseAmount", () => {
    it("parses Pakistani formatted strings to integer rupees", () => {
      expect(parseAmount("5,00,000")).toBe(500000);
      expect(parseAmount("1,50,00,000")).toBe(15000000);
      expect(parseAmount("25,000")).toBe(25000);
    });

    it("parses plain numbers and strings with spaces", () => {
      expect(parseAmount("500000")).toBe(500000);
      expect(parseAmount(" 75,000 ")).toBe(75000);
    });

    it("handles invalid or empty inputs gracefully", () => {
      expect(parseAmount("")).toBe(0);
      expect(parseAmount("abc")).toBe(0);
    });
  });

  describe("formatPKR", () => {
    it("formats standard integer rupees with commas", () => {
      expect(formatPKR(500000)).toBe("Rs 500,000");
      expect(formatPKR(15000000)).toBe("Rs 15,000,000");
    });

    it("formats with Pakistani lakh/crore grouping when requested", () => {
      expect(formatPKR(500000, { lakhCrore: true })).toBe("Rs 5,00,000");
      expect(formatPKR(15000000, { lakhCrore: true })).toBe("Rs 1,50,00,000");
      expect(formatPKR(25000, { lakhCrore: true })).toBe("Rs 25,000");
    });

    it("formats negative amounts with leading minus sign", () => {
      expect(formatPKR(-50000)).toBe("-Rs 50,000");
      expect(formatPKR(-500000, { lakhCrore: true })).toBe("-Rs 5,00,000");
    });

    it("supports omitting currency symbol", () => {
      expect(formatPKR(500000, { showSymbol: false })).toBe("500,000");
      expect(formatPKR(500000, { showSymbol: false, lakhCrore: true })).toBe("5,00,000");
    });
  });

  describe("formatCompact", () => {
    it("formats amounts with Cr, L, K suffixes", () => {
      expect(formatCompact(15000000)).toBe("1.5 Cr");
      expect(formatCompact(10000000)).toBe("1 Cr");
      expect(formatCompact(500000)).toBe("5 L");
      expect(formatCompact(50000)).toBe("50K");
      expect(formatCompact(500)).toBe("500");
    });
  });
});
