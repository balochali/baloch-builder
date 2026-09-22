import { useState, type FormEvent } from "react";
import { BuildingDetailsSchema, decodeBuildingSpaces, decodeFloorLayout,
  type BuildingDetailsInput, type BuildingSpace } from "@/data/repositories/projectBuildingRepository";
import type { ProjectBuildingDetails } from "@/domain/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface Props {
  projectId: string;
  details: ProjectBuildingDetails | null;
  onOpenChange: (open: boolean) => void;
  onSubmit: (value: BuildingDetailsInput) => Promise<void>;
}

type FlatDraft = { rooms: string; count: string };
type FloorDraft = { floor_index: number; flat_types: FlatDraft[] };

const spaceOptions: { value: BuildingSpace; label: string; description: string }[] = [
  { value: "flats", label: "Flats", description: "Plan flats and room counts by floor" },
  { value: "shops", label: "Shops", description: "Ground or upper-floor retail spaces" },
  { value: "offices", label: "Offices", description: "Commercial office spaces" },
  { value: "houses", label: "Houses", description: "Separate planned houses" },
  { value: "parking", label: "Parking", description: "Planned parking spaces" },
  { value: "masjid", label: "Masjid", description: "Include a masjid in the plan" },
  { value: "lift", label: "Lift", description: "Passenger or service lift" },
  { value: "generator", label: "Generator", description: "Backup electricity" },
  { value: "rooftop", label: "Rooftop", description: "Shared roof access or use" },
  { value: "water_tank", label: "Water tank", description: "Planned water storage" },
  { value: "fire_safety", label: "Fire safety", description: "Fire safety provision" },
];

function initialSpaces(details: ProjectBuildingDetails | null): BuildingSpace[] {
  if (!details) return [];
  const saved = decodeBuildingSpaces(details.selected_spaces_json ?? "[]");
  if (saved.length) return saved;
  const inferred: BuildingSpace[] = [];
  if (details.planned_flats) inferred.push("flats");
  if (details.planned_shops) inferred.push("shops");
  if (details.planned_offices) inferred.push("offices");
  if (details.planned_houses) inferred.push("houses");
  if (details.planned_parking_spaces) inferred.push("parking");
  if (details.has_masjid) inferred.push("masjid");
  return inferred;
}

function optionalNumber(value: string): number | null {
  return value.trim() ? Number(value) : null;
}

function positiveInteger(value: string): number | null {
  const number = Number(value);
  return /^\d+$/.test(value.trim()) && Number.isSafeInteger(number) && number > 0 ? number : null;
}

export function BuildingDetailsDialog({ projectId, details, onOpenChange, onSubmit }: Props) {
  const [step, setStep] = useState(0);
  const [buildingUse, setBuildingUse] = useState(details?.building_use ?? "");
  const [spaces, setSpaces] = useState<BuildingSpace[]>(() => initialSpaces(details));
  const [floors, setFloors] = useState(String(details?.floors_above_ground ?? ""));
  const [basements, setBasements] = useState(String(details?.basement_count ?? ""));
  const [floorDrafts, setFloorDrafts] = useState<FloorDraft[]>(() => {
    const saved = decodeFloorLayout(details?.floor_layout_json ?? "[]");
    return Array.from({ length: details?.floors_above_ground ?? 0 }, (_, index) => ({
      floor_index: index,
      flat_types: (saved[index]?.flat_types ?? []).map((type) => ({
        rooms: String(type.rooms), count: String(type.count),
      })),
    }));
  });
  const [shops, setShops] = useState(String(details?.planned_shops ?? ""));
  const [offices, setOffices] = useState(String(details?.planned_offices ?? ""));
  const [houses, setHouses] = useState(String(details?.planned_houses ?? ""));
  const [parking, setParking] = useState(String(details?.planned_parking_spaces ?? ""));
  const [plotArea, setPlotArea] = useState(String(details?.plot_area_value ?? ""));
  const [plotUnit, setPlotUnit] = useState(details?.plot_area_unit ?? "");
  const [coveredArea, setCoveredArea] = useState(String(details?.covered_area_sqft ?? ""));
  const [notes, setNotes] = useState(details?.notes ?? "");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const floorCount = positiveInteger(floors);
  const hasFlats = spaces.includes("flats");

  function toggleSpace(space: BuildingSpace) {
    setSpaces((current) => current.includes(space) ? current.filter((item) => item !== space) : [...current, space]);
  }

  function changeFloors(value: string) {
    setFloors(value);
    const count = positiveInteger(value);
    if (count && count <= 50) {
      setFloorDrafts((current) => Array.from({ length: Math.max(count, current.length) }, (_, index) =>
        current[index] ?? { floor_index: index, flat_types: [] }));
    }
  }

  function updateFlatType(floorIndex: number, typeIndex: number, key: keyof FlatDraft, value: string) {
    setFloorDrafts((current) => current.map((floor, index) => index === floorIndex ? {
      ...floor,
      flat_types: floor.flat_types.map((type, row) => row === typeIndex ? { ...type, [key]: value } : type),
    } : floor));
  }

  function addFlatType(floorIndex: number) {
    setFloorDrafts((current) => current.map((floor, index) => index === floorIndex ? {
      ...floor, flat_types: [...floor.flat_types, { rooms: "", count: "" }],
    } : floor));
  }

  function removeFlatType(floorIndex: number, typeIndex: number) {
    setFloorDrafts((current) => current.map((floor, index) => index === floorIndex ? {
      ...floor, flat_types: floor.flat_types.filter((_, row) => row !== typeIndex),
    } : floor));
  }

  function parsedFloorLayout() {
    if (!hasFlats) return [];
    return Array.from({ length: floorCount ?? 0 }, (_, index) => ({
      floor_index: index,
      flat_types: (floorDrafts[index]?.flat_types ?? []).map((type) => ({
        rooms: optionalNumber(type.rooms), count: optionalNumber(type.count),
      })),
    }));
  }

  function next() {
    setError("");
    if (step === 0 && !buildingUse) { setError("Choose the building use to continue."); return; }
    if (step === 1 && !["flats", "shops", "offices", "houses"].some((space) => spaces.includes(space as BuildingSpace))) {
      setError("Select at least one flat, shop, office or house type."); return;
    }
    if (step === 2) {
      if (!floorCount || floorCount > 50) { setError("Enter a total of 1 to 50 floors, including the ground floor."); return; }
      if (basements && (!/^\d+$/.test(basements) || Number(basements) > 100)) {
        setError("Basements must be a whole number from 0 to 100."); return;
      }
      if (hasFlats) {
        const layout = parsedFloorLayout();
        const total = layout.reduce((sum, floor) => sum + floor.flat_types.reduce((n, type) => n + (type.count ?? 0), 0), 0);
        if (!total || layout.some((floor) => floor.flat_types.some((type) =>
          type.rooms === null || type.count === null || type.rooms < 1 || type.count < 1))) {
          setError("Add valid room and flat counts on at least one floor."); return;
        }
      }
    }
    setStep((current) => Math.min(current + 1, 3));
  }

  function back() {
    if (step === 0) { onOpenChange(false); return; }
    setError("");
    setStep((current) => current - 1);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (step < 3) { next(); return; }
    setError("");
    const parsed = BuildingDetailsSchema.safeParse({
      project_id: projectId,
      building_use: buildingUse || null,
      spaces,
      floors_above_ground: optionalNumber(floors),
      basement_count: optionalNumber(basements),
      floor_layout: parsedFloorLayout(),
      planned_shops: spaces.includes("shops") ? optionalNumber(shops) : null,
      planned_offices: spaces.includes("offices") ? optionalNumber(offices) : null,
      planned_houses: spaces.includes("houses") ? optionalNumber(houses) : null,
      planned_parking_spaces: spaces.includes("parking") ? optionalNumber(parking) : null,
      plot_area_value: optionalNumber(plotArea),
      plot_area_unit: plotUnit || null,
      covered_area_sqft: optionalNumber(coveredArea),
      notes,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check the building details.");
      return;
    }
    setSaving(true);
    try {
      await onSubmit(parsed.data);
      onOpenChange(false);
    } catch (cause) {
      setError(`Could not save building details: ${String(cause)}`);
    } finally {
      setSaving(false);
    }
  }

  return <Dialog open onOpenChange={onOpenChange}>
    <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
      <DialogHeader><DialogTitle>{details ? "Edit Building Details" : "Add Building Details"}</DialogTitle></DialogHeader>
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Step {step + 1} of 4</p>
      <form id="building-details-form" onSubmit={handleSubmit} className="space-y-5">
        {step === 0 && <div className="space-y-2">
          <h3 className="font-semibold">What is the building used for?</h3>
          <p className="text-sm text-muted-foreground">Choose the main use first. You can change it later.</p>
          <Label htmlFor="building-use">Building use</Label>
          <select id="building-use" value={buildingUse} onChange={(event) => setBuildingUse(event.target.value)}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
            <option value="">Select building use</option>
            <option value="residential">Residential</option>
            <option value="commercial">Commercial</option>
            <option value="mixed-use">Mixed residential and commercial</option>
          </select>
        </div>}

        {step === 1 && <div className="space-y-3">
          <h3 className="font-semibold">What spaces and facilities are planned?</h3>
          <p className="text-sm text-muted-foreground">Select what the project includes. The next steps will ask only for relevant counts.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {spaceOptions.map((option) => <label key={option.value}
              className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 hover:bg-accent/40">
              <input type="checkbox" checked={spaces.includes(option.value)}
                onChange={() => toggleSpace(option.value)} className="mt-1 size-4" />
              <span><span className="block text-sm font-medium">{option.label}</span>
                <span className="block text-xs text-muted-foreground">{option.description}</span></span>
            </label>)}
          </div>
        </div>}

        {step === 2 && <div className="space-y-5">
          <div>
            <h3 className="font-semibold">Floors and layout</h3>
            <p className="text-sm text-muted-foreground">Count the ground floor as one floor. Add flat types only on floors that have flats.</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="building-floors">Total floors, including ground *</Label>
              <Input id="building-floors" type="number" min="1" max="50" step="1" value={floors}
                onChange={(event) => changeFloors(event.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="building-basements">Basements</Label>
              <Input id="building-basements" type="number" min="0" max="100" step="1" value={basements}
                onChange={(event) => setBasements(event.target.value)} />
            </div>
          </div>
          {hasFlats && floorCount && floorCount <= 50 && <div className="space-y-3">
            <h4 className="text-sm font-semibold">Flats on each floor</h4>
            {Array.from({ length: floorCount }, (_, index) => <div key={index} className="rounded-lg border p-3">
              <div className="mb-3 flex items-center justify-between gap-2">
                <span className="text-sm font-medium">{index === 0 ? "Ground floor" : `Floor ${index}`}</span>
                <Button type="button" size="sm" variant="outline" onClick={() => addFlatType(index)}>Add flat type</Button>
              </div>
              {(floorDrafts[index]?.flat_types ?? []).length === 0 &&
                <p className="text-xs text-muted-foreground">No flats planned on this floor.</p>}
              {(floorDrafts[index]?.flat_types ?? []).map((type, typeIndex) => <div key={typeIndex}
                className="mb-2 grid grid-cols-[1fr_1fr_auto] items-end gap-2">
                <div className="space-y-1">
                  <Label htmlFor={`rooms-${index}-${typeIndex}`}>Rooms per flat</Label>
                  <Input id={`rooms-${index}-${typeIndex}`} type="number" min="1" max="20" step="1" value={type.rooms}
                    onChange={(event) => updateFlatType(index, typeIndex, "rooms", event.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor={`flats-${index}-${typeIndex}`}>Number of flats</Label>
                  <Input id={`flats-${index}-${typeIndex}`} type="number" min="1" max="1000" step="1" value={type.count}
                    onChange={(event) => updateFlatType(index, typeIndex, "count", event.target.value)} />
                </div>
                <Button type="button" size="sm" variant="ghost" aria-label={`Remove flat type from ${index === 0 ? "ground floor" : `floor ${index}`}`}
                  onClick={() => removeFlatType(index, typeIndex)}>Remove</Button>
              </div>)}
            </div>)}
          </div>}
          {hasFlats && details?.planned_flats && floorDrafts.every((floor) => floor.flat_types.length === 0) &&
            <p className="text-xs text-muted-foreground">This project already has {details.planned_flats} planned flats. Assign them by floor and room count before saving the new layout.</p>}
        </div>}

        {step === 3 && <div className="space-y-5">
          <div>
            <h3 className="font-semibold">Counts, areas and notes</h3>
            <p className="text-sm text-muted-foreground">Add the remaining details you know now. Blank fields can be filled later.</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {spaces.includes("shops") && <CountField id="building-shops" label="Planned shops" value={shops} onChange={setShops} />}
            {spaces.includes("offices") && <CountField id="building-offices" label="Planned offices" value={offices} onChange={setOffices} />}
            {spaces.includes("houses") && <CountField id="building-houses" label="Planned houses" value={houses} onChange={setHouses} />}
            {spaces.includes("parking") && <CountField id="building-parking" label="Parking spaces" value={parking} onChange={setParking} />}
          </div>
          {spaces.includes("masjid") && <p className="rounded-md border px-3 py-2 text-sm">Masjid included in the plan</p>}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="building-plot-area">Plot area</Label>
              <Input id="building-plot-area" type="number" min="0" step="any" value={plotArea}
                onChange={(event) => setPlotArea(event.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="building-plot-unit">Plot area unit</Label>
              <select id="building-plot-unit" value={plotUnit} onChange={(event) => setPlotUnit(event.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
                <option value="">Select unit</option>
                <option value="marla">Marla</option><option value="kanal">Kanal</option>
                <option value="sqft">Square feet</option><option value="sqyd">Square yards</option>
                <option value="acre">Acres</option>
              </select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="building-covered-area">Total planned covered area (sq ft)</Label>
            <Input id="building-covered-area" type="number" min="0" step="any" value={coveredArea}
              onChange={(event) => setCoveredArea(event.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="building-notes">Building plan notes</Label>
            <textarea id="building-notes" rows={3} value={notes} onChange={(event) => setNotes(event.target.value)}
              placeholder="Layout, unit sizes, approvals or other planned details"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
          </div>
        </div>}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      </form>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={back}>
          {step ? "Back" : "Cancel"}
        </Button>
        <Button type="submit" form="building-details-form" disabled={saving}>
          {saving ? "Saving…" : step === 3 ? "Save Details" : "Next"}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}

function CountField({ id, label, value, onChange }: {
  id: string; label: string; value: string; onChange: (value: string) => void;
}) {
  return <div className="space-y-1.5">
    <Label htmlFor={id}>{label}</Label>
    <Input id={id} type="number" min="0" step="1" value={value}
      onChange={(event) => onChange(event.target.value)} />
  </div>;
}
