import { z } from "zod";
export const parcelUnits = ["Marla", "Kanal", "Sq ft", "Sq yard", "Acre"] as const;
export const parcelStages = [
  "Identified",
  "Under negotiation",
  "Agreement signed",
  "Purchased",
  "Registered in our name",
] as const;
export const buildingTypes = [
  "Residential flats only",
  "Flats + shops (mixed)",
  "Commercial only",
  "Houses / villas",
  "Other",
] as const;
export const floorUses = ["Parking", "Shops", "Flats", "Mixed", "Services"] as const;
export const unitCategories = ["Flat", "Shop", "Office", "Other"] as const;
export const structureTypes = ["RCC frame", "Load-bearing", "Other"] as const;
export const amenities = [
  "Lift",
  "Generator backup",
  "Underground water tank",
  "Security & CCTV",
  "Parking",
  "Rooftop / terrace",
  "Intercom",
  "Fire safety",
  "Gas supply",
  "Solar",
] as const;
const text = z.string().trim().max(500);
const name = text.min(1);
const area = z.number().finite().nonnegative().max(1e12);
const count = z.number().int().nonnegative().max(1e6);
const id = z.string().uuid();
export const parcelSchema = z
  .object({
    id,
    name,
    address: text,
    mapLink: z
      .string()
      .max(2048)
      .refine(
        (value) => !value || /^https?:\/\//i.test(value),
        "Use a link beginning with https:// or http://",
      )
      .refine(
        (value) => !value || z.string().url().safeParse(value).success,
        "Enter a valid map link",
      ),
    area: z.object({ value: area.positive(), unit: z.enum(parcelUnits) }),
    acquisitionType: z.enum(["purchase", "partner_contribution"]),
    sellerPartyId: id.optional(),
    contributingPartnerId: id.optional(),
    stage: z.enum(parcelStages),
    agreementRef: text,
    agreementDate: z.string().date().or(z.literal("")),
    facing: text,
    notes: text,
  })
  .refine(
    (p) => (p.acquisitionType === "purchase" ? !!p.sellerPartyId : !!p.contributingPartnerId),
    "Select or add a seller or partner.",
  );
export const partySchema = z.object({
  name,
  type: z.enum(["seller", "client", "supplier", "contractor", "lender", "other"]),
  phone: text,
  address: text,
  notes: text,
});
export const buildingSchema = z
  .object({
    name,
    buildingType: z.enum(buildingTypes),
    floorsAboveGround: count.max(100),
    basements: count.max(20),
    hasMezzanine: z.boolean(),
    hasRoof: z.boolean(),
    coveredAreaPerFloor: area,
    coveredAreaOverride: area.optional(),
    lifts: count,
    parkingSpaces: count,
    structureType: z.enum(structureTypes),
    approvalRef: text,
    notes: text,
    amenities: z.array(z.enum(amenities)).max(10),
    floors: z
      .array(
        z.object({
          id,
          label: text,
          use: z.enum(floorUses),
          unitCount: count,
          floorAreaSqft: area,
          notes: text,
          generatedKey: text.optional(),
        }),
      )
      .max(500),
    units: z
      .array(
        z.object({
          id,
          category: z.enum(unitCategories),
          name: text,
          count,
          sizeSqft: area,
          bedrooms: count,
          bathrooms: count,
          kitchens: count,
          lounges: count,
          balconies: count,
          floorsText: text,
          notes: text,
        }),
      )
      .max(500),
  })
  .refine(
    (b) =>
      b.buildingType !== "Residential flats only" || !b.units.some((u) => u.category === "Shop"),
    "Change the shop rows before choosing residential flats only.",
  );
export type ParcelInput = z.input<typeof parcelSchema>;
export type LandParcel = ParcelInput & {
  createdAt: string;
  updatedAt: string;
  attachments: { id: string; name: string; uploadedAt: string }[];
};
export type SiteBuilding = z.infer<typeof buildingSchema>;
export type SiteParty = z.infer<typeof partySchema> & { id: string };
export type SitePartner = { id: string; name: string };
export function emptyBuilding(name: string): SiteBuilding {
  return {
    name,
    buildingType: "Residential flats only",
    floorsAboveGround: 0,
    basements: 0,
    hasMezzanine: false,
    hasRoof: false,
    coveredAreaPerFloor: 0,
    lifts: 0,
    parkingSpaces: 0,
    structureType: "RCC frame",
    approvalRef: "",
    notes: "",
    amenities: [],
    floors: [],
    units: [],
  };
}
