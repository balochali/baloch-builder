import type { LandParcel, SiteBuilding, SiteParty, SitePartner } from "@baloch/shared";
export const squareFeetPerUnit = {
  Marla: 272.25,
  Kanal: 20 * 272.25,
  "Sq ft": 1,
  "Sq yard": 9,
  Acre: 43560,
};
export type AreaUnit = keyof typeof squareFeetPerUnit;
export type SiteData = {
  parcels: LandParcel[];
  sellers: SiteParty[];
  partners: SitePartner[];
  building: SiteBuilding;
};
export function totalLandArea(parcels: LandParcel[], unit: AreaUnit) {
  return (
    parcels.reduce((sum, p) => sum + p.area.value * squareFeetPerUnit[p.area.unit], 0) /
    squareFeetPerUnit[unit]
  );
}
export const areaNumber = (n: number) => n.toLocaleString("en-PK", { maximumFractionDigits: 2 });
export async function encodeAttachments(files: File[]) {
  if (
    files.length > 5 ||
    files.some((file) => !file.size) ||
    files.reduce((sum, file) => sum + file.size, 0) > 5 * 1024 * 1024
  )
    throw new Error("Choose up to five non-empty files totaling 5 MB or less.");
  return Promise.all(
    files.map(
      (file) =>
        new Promise<{ name: string; content: string }>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () =>
            resolve({ name: file.name, content: String(reader.result).split(",")[1] });
          reader.onerror = () => reject(new Error("Could not read " + file.name));
          reader.readAsDataURL(file);
        }),
    ),
  );
}
