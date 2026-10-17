import { ZodError } from "zod";

/** Turns what a person typed (or pasted from Excel) into clean values for the database. */

const pad = (n: number) => String(n).padStart(2, "0");

function validDate(y: number, m: number, d: number): string | null {
    const date = new Date(Date.UTC(y, m - 1, d));
    if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d)
        return null;
    return `${y}-${pad(m)}-${pad(d)}`;
}

/** Accepts 14/10/2026, 14-10-2026, 14.10.2026, 2026-10-14 or an Excel date number. */
export function parseDate(text: string): string | null {
    const value = text.trim();
    if (!value) return null;
    let match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(value);
    if (match) return validDate(Number(match[1]), Number(match[2]), Number(match[3]));
    match = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4}|\d{2})$/.exec(value);
    if (match) {
        const year = match[3].length === 2 ? 2000 + Number(match[3]) : Number(match[3]);
        return validDate(year, Number(match[2]), Number(match[1]));
    }
    if (/^\d{5}$/.test(value)) {
        const serial = Number(value);
        if (serial < 20000 || serial > 80000) return null;
        const date = new Date(Date.UTC(1899, 11, 30) + serial * 86400000);
        return validDate(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
    }
    return null;
}

export function displayDate(iso: string): string {
    const [y, m, d] = iso.split("-");
    return `${d}/${m}/${y}`;
}

/** Whole rupees / counts: allows commas, spaces and "Rs". Returns null for blank. */
export function parseWhole(label: string, text: string): number | null {
    const value = text.replace(/rs\.?|pkr|[,\s]/gi, "");
    if (!value) return null;
    if (!/^\d+$/.test(value)) throw new Error(`${label}: enter a whole number (digits only)`);
    const n = Number(value);
    if (!Number.isSafeInteger(n)) throw new Error(`${label}: number is too large`);
    return n;
}

export function parseDecimal(label: string, text: string): number | null {
    const value = text.replace(/[,\s]/g, "");
    if (!value) return null;
    if (!/^\d+(\.\d+)?$/.test(value)) throw new Error(`${label}: enter a number`);
    return Number(value);
}

/** Clean a cell after typing/pasting so the sheet looks tidy. */
export function tidyCell(kind: "text" | "number" | "date" | undefined, text: string): string {
    const value = text.trim();
    if (!value) return "";
    if (kind === "date") {
        const iso = parseDate(value);
        return iso ? displayDate(iso) : value;
    }
    if (kind === "number") return value.replace(/rs\.?|pkr|[,\s]/gi, "");
    return value;
}

export function parseFloor(text: string): number {
    const value = text.trim().toLowerCase();
    if (!value) throw new Error("Floor: enter Ground, 1, 2, 3…");
    if (/^(g|gf|ground|ground floor|0)$/.test(value)) return 0;
    const match = /^(?:floor\s*)?(\d{1,3})(?:st|nd|rd|th)?(?:\s*floor)?$/.exec(value);
    const n = match ? Number(match[1]) : NaN;
    if (!Number.isInteger(n) || n < 0 || n > 100) throw new Error("Floor: enter Ground, 1, 2, 3…");
    return n;
}

export function parseKind(text: string): "flat" | "shop" {
    const value = text.trim().toLowerCase();
    if (!value || value === "flat" || value === "apartment") return "flat";
    if (value === "shop") return "shop";
    throw new Error("Type: write Flat or Shop");
}

export const AREA_UNITS = ["marla", "kanal", "sqft", "sqyd", "acre"] as const;
export function parseAreaUnit(text: string): (typeof AREA_UNITS)[number] | null {
    const value = text.trim().toLowerCase().replace(/[\s.]/g, "");
    if (!value) return null;
    const map: Record<string, (typeof AREA_UNITS)[number]> = {
        marla: "marla",
        marlas: "marla",
        kanal: "kanal",
        kanals: "kanal",
        canal: "kanal",
        sqft: "sqft",
        sft: "sqft",
        squarefeet: "sqft",
        squarefoot: "sqft",
        sqyd: "sqyd",
        sqyard: "sqyd",
        squareyards: "sqyd",
        yards: "sqyd",
        acre: "acre",
        acres: "acre",
    };
    const unit = map[value];
    if (!unit) throw new Error("Area unit: use Marla, Kanal, Sq ft, Sq yd or Acre");
    return unit;
}

export type PayMethod = "cash" | "bank" | "digital" | "cheque" | "other";
export function parseMethod(text: string): PayMethod {
    const value = text.trim().toLowerCase();
    if (!value || value === "cash") return "cash";
    if (value === "bank" || value === "bank transfer") return "bank";
    if (["digital", "online", "wallet", "easypaisa", "jazzcash"].includes(value)) return "digital";
    if (value === "cheque" || value === "check") return "cheque";
    if (value === "other") return "other";
    throw new Error("Payment method: Cash, Bank, Online, Cheque or Other");
}

export function parseAccount(text: string): "personal" | "builder" | undefined {
    const value = text.trim().toLowerCase();
    if (!value) return undefined;
    if (value.startsWith("personal")) return "personal";
    if (value.startsWith("builder")) return "builder";
    throw new Error("Paid from: write Personal or Builder");
}

/** Plain-language message from any error (zod errors list technical JSON otherwise). */
export function describeError(error: unknown): string {
    if (error instanceof ZodError) return error.issues[0]?.message ?? "Please check this row";
    if (error instanceof Error) return error.message.replace(/^Error:\s*/, "");
    return "Could not save this row";
}