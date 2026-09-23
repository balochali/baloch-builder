import { useState, type FormEvent } from "react";
import { format } from "date-fns";
import { ActualCostInputSchema, EstimateInputSchema,
  type ActualCostInput, type EstimateInput } from "@/data/repositories/projectFinanceRepository";
import type { ProjectBuildingDetails, ProjectEstimate } from "@/domain/types";
import { flatRecoveryLines, plannedFlatGroups, recoveryInventory, recoveryLabels, recoveryLink, type RecoverySpace } from "./recoverySpaces";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type EntryMode = "estimate" | "actual";
const costOptions = ["Sirya Cost", "Cement Cost", "Electrical Items Cost", "Plumber Items Cost", "Tiles Cost", "Sirya Wire Cost", "Color Cost", "Marble Cost", "Grill Cost"];

interface Props {
  mode: EntryMode;
  projectId: string;
  estimate?: ProjectEstimate | null;
  estimateKind?: "cost" | "revenue";
  buildingDetails?: ProjectBuildingDetails | null;
  recoveryEstimates?: ProjectEstimate[];
  onOpenChange: (open: boolean) => void;
  onEstimate: (value: EstimateInput) => Promise<void>;
  onActual: (value: ActualCostInput) => Promise<void>;
}

function wholeRupees(input: string): number | null {
  const trimmed = input.trim();
  if (!/^\d+(?:,\d+)*$/.test(trimmed)) return null;
  const value = Number(trimmed.replace(/,/g, ""));
  return Number.isSafeInteger(value) ? value : null;
}

export function ProjectEntryDialog({ mode, projectId, estimate, estimateKind = "cost", buildingDetails = null, recoveryEstimates = [], onOpenChange, onEstimate, onActual }: Props) {
  const kind = estimate?.kind ?? estimateKind;
  const linkedRecovery = estimate ? recoveryLink(estimate) : null;
  const inventory = recoveryInventory(buildingDetails).map((item) => ({
    ...item, available: item.count - recoveryEstimates.filter((row) => row.id !== estimate?.id)
      .reduce((used, row) => { const link = recoveryLink(row); return used + (link?.space === item.space ? link.quantity : 0); }, 0),
  })).filter((item) => item.available > 0);
  const legacyRecovery = kind === "revenue" && !!estimate && !linkedRecovery;
  const savedFlatLines = estimate ? flatRecoveryLines(estimate) : [];
  const flatGroups = plannedFlatGroups(buildingDetails);
  const [title, setTitle] = useState(estimate?.title ?? "");
  const [costChoice, setCostChoice] = useState(estimate?.kind === "cost" ? costOptions.includes(estimate.title) ? estimate.title : "other" : "");
  const [details, setDetails] = useState(estimate?.details ?? "");
  const [minimum, setMinimum] = useState(estimate ? String(estimate.minimum_amount) : "");
  const [maximum, setMaximum] = useState(estimate ? String(estimate.maximum_amount) : "");
  const [recoverySpace, setRecoverySpace] = useState<RecoverySpace | "">(linkedRecovery?.space ?? "");
  const detailedFlats = recoverySpace === "flats" && flatGroups.length > 0 && (!estimate || savedFlatLines.length > 0);
  const selectedSpace = inventory.find((item) => item.space === recoverySpace);
  const [recoveryQuantity, setRecoveryQuantity] = useState(linkedRecovery?.quantity ?? 0);
  const [flatDrafts, setFlatDrafts] = useState(() => {
    let remaining = inventory.find((item) => item.space === "flats")?.available ?? 0;
    return flatGroups.map((group) => {
      const saved = savedFlatLines.find((line) => line.floor_index === group.floor_index && line.rooms === group.rooms);
      const used = recoveryEstimates.filter((row) => row.id !== estimate?.id).flatMap(flatRecoveryLines)
        .filter((line) => line.floor_index === group.floor_index && line.rooms === group.rooms)
        .reduce((total, line) => total + line.quantity, 0);
      const quantity = saved?.quantity ?? Math.min(Math.max(0, group.count - used), remaining);
      remaining -= quantity;
      return { floor_index: group.floor_index, rooms: group.rooms, quantity,
        minimum: saved ? String(saved.minimum_unit_price) : "", maximum: saved ? String(saved.maximum_unit_price) : "" };
    });
  });
  const flatAvailable = (floorIndex: number, rooms: number) => {
    const group = flatGroups.find((item) => item.floor_index === floorIndex && item.rooms === rooms);
    const used = recoveryEstimates.filter((row) => row.id !== estimate?.id).flatMap(flatRecoveryLines)
      .filter((line) => line.floor_index === floorIndex && line.rooms === rooms)
      .reduce((total, line) => total + line.quantity, 0);
    return Math.max(0, (group?.count ?? 0) - used);
  };
  const includedFlats = flatDrafts.filter((line) => line.quantity > 0);
  const flatMinTotal = includedFlats.reduce((total, line) => total + line.quantity * (wholeRupees(line.minimum) ?? 0), 0);
  const flatMaxTotal = includedFlats.reduce((total, line) => total + line.quantity * (wholeRupees(line.maximum) ?? 0), 0);
  const flatCount = includedFlats.reduce((total, line) => total + line.quantity, 0);
  const [unitMinimum, setUnitMinimum] = useState(linkedRecovery ? String(estimate!.minimum_amount / linkedRecovery.quantity) : "");
  const [unitMaximum, setUnitMaximum] = useState(linkedRecovery ? String(estimate!.maximum_amount / linkedRecovery.quantity) : "");
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<"cash" | "bank" | "cheque" | "other">("cash");
  const [reference, setReference] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    let value: EstimateInput | ActualCostInput;
    if (mode === "estimate") {
      const linked = kind === "revenue" && !legacyRecovery;
      const minimumValue = linked ? detailedFlats ? flatMinTotal : wholeRupees(unitMinimum) : wholeRupees(minimum);
      const maximumValue = linked ? detailedFlats ? flatMaxTotal : wholeRupees(unitMaximum) : wholeRupees(maximum);
      if (linked && !detailedFlats && (!selectedSpace || !Number.isInteger(recoveryQuantity) || recoveryQuantity < 1 || recoveryQuantity > selectedSpace.available || minimumValue === null || maximumValue === null)) {
        setError("Choose a planned space and a quantity within the available count, then enter whole rupee prices per unit.");
        return;
      }
      if (detailedFlats && (!selectedSpace || flatCount < 1 || flatCount > selectedSpace.available || includedFlats.some((line) => !Number.isInteger(line.quantity) || line.quantity > flatAvailable(line.floor_index, line.rooms) || wholeRupees(line.minimum) === null || wholeRupees(line.maximum) === null || wholeRupees(line.maximum)! < wholeRupees(line.minimum)!))) {
        setError("Check each flat group: choose available quantities and enter a valid lowest and highest price per flat.");
        return;
      }
      const parsed = EstimateInputSchema.safeParse({
        project_id: projectId, kind, title: linked ? `${recoveryLabels[recoverySpace as RecoverySpace]} sales` : title, details,
        minimum_amount: linked ? detailedFlats ? flatMinTotal : minimumValue! * recoveryQuantity : minimumValue,
        maximum_amount: linked ? detailedFlats ? flatMaxTotal : maximumValue! * recoveryQuantity : maximumValue,
        recovery_space: linked ? recoverySpace : null,
        recovery_quantity: linked ? detailedFlats ? flatCount : recoveryQuantity : null,
        flat_recovery_lines: detailedFlats ? includedFlats.map((line) => ({ floor_index: line.floor_index, rooms: line.rooms,
          quantity: line.quantity, minimum_unit_price: wholeRupees(line.minimum)!, maximum_unit_price: wholeRupees(line.maximum)! })) : undefined,
      });
      if (!parsed.success) {
        setError(parsed.error.issues[0]?.message ?? "Check the estimate details.");
        return;
      }
      value = parsed.data;
    } else {
      const parsed = ActualCostInputSchema.safeParse({
        project_id: projectId, date, amount: wholeRupees(amount),
        description: title, method, reference,
      });
      if (!parsed.success) {
        setError(parsed.error.issues[0]?.message ?? "Check the cost details.");
        return;
      }
      value = parsed.data;
    }

    setPending(true);
    try {
      if (mode === "estimate") await onEstimate(value as EstimateInput);
      else await onActual(value as ActualCostInput);
      onOpenChange(false);
    } catch (cause) {
      setError(`Could not save: ${String(cause)}`);
    } finally {
      setPending(false);
    }
  }

  return <Dialog open onOpenChange={onOpenChange}>
    <DialogContent className={`max-h-[90vh] overflow-y-auto ${detailedFlats ? "sm:max-w-2xl" : "sm:max-w-lg"}`}>
      <DialogHeader><DialogTitle>{estimate ? `Edit ${kind === "cost" ? "Expected Cost" : "Expected Recovery"}` : mode === "estimate" ? `Add ${kind === "cost" ? "Expected Cost" : "Expected Recovery"}` : "Add Actual Cost"}</DialogTitle></DialogHeader>
      <form id="project-entry-form" onSubmit={save} className="space-y-4">
        {mode === "estimate" && kind === "cost" && <div className="space-y-1.5">
          <Label htmlFor="entry-cost-choice">Cost item *</Label>
          <select id="entry-cost-choice" value={costChoice} onChange={(event) => {
            const choice = event.target.value;
            setCostChoice(choice);
            setTitle(choice === "other" ? "" : choice);
          }} required className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
            <option value="" disabled>Select a cost item</option>
            {costOptions.map((option) => <option key={option} value={option}>{option}</option>)}
            <option value="other">Other — write your own</option>
          </select>
        </div>}
        {mode === "estimate" && kind === "revenue" && !legacyRecovery && <div className="space-y-2">
          <Label htmlFor="entry-recovery-space">Space to sell *</Label>
          {inventory.length > 0 ? <>
            <select id="entry-recovery-space" value={recoverySpace} required onChange={(event) => { const space = event.target.value as RecoverySpace; setRecoverySpace(space); setRecoveryQuantity(inventory.find((item) => item.space === space)?.available ?? 0); }} className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
              <option value="" disabled>Select a space from the building plan</option>
              {inventory.map((item) => <option value={item.space} key={item.space}>{recoveryLabels[item.space]} — {item.available} available of {item.count} planned</option>)}
            </select>
            {selectedSpace && !detailedFlats && <div className="space-y-1.5"><Label htmlFor="entry-recovery-quantity">Number of {selectedSpace.space} to sell *</Label><Input id="entry-recovery-quantity" type="number" min={1} max={selectedSpace.available} value={recoveryQuantity || ""} onChange={(event) => setRecoveryQuantity(Number(event.target.value))} required /><p className="text-sm text-muted-foreground">{selectedSpace.available} available from the building plan. You can estimate fewer now and add the rest later.</p></div>}
          </> : <p role="status" className="rounded-md border p-3 text-sm text-muted-foreground">No saleable spaces are available. Add flats, shops, offices or houses in Building Details, or edit an existing recovery estimate.</p>}
        </div>}
        {(mode !== "estimate" || legacyRecovery || kind === "cost" && costChoice === "other") && <div className="space-y-1.5">
          <Label htmlFor="entry-title">{mode === "actual" ? "Cost description" : kind === "cost" ? "Other cost name" : "Recovery item name"} *</Label>
          <Input id="entry-title" value={title} onChange={(event) => setTitle(event.target.value)}
            placeholder={mode === "actual" ? "e.g. Cement payment" : kind === "cost" ? "e.g. Transport Cost" : "e.g. Flat sales"} required />
        </div>}
        {mode === "estimate" && kind === "revenue" && !legacyRecovery && detailedFlats ? <>
          <p className="text-sm text-muted-foreground">Set a selling price for each floor and flat size. The total is calculated from the number of flats you include.</p>
          <div className="flat-recovery-groups">{flatDrafts.map((line, index) => {
            const available = flatAvailable(line.floor_index, line.rooms);
            return <div className="flat-recovery-row" key={`${line.floor_index}-${line.rooms}`}>
              <div className="flat-recovery-label"><strong>{line.floor_index === 0 ? "Ground" : `Floor ${line.floor_index}`} · {line.rooms} rooms</strong><span>{available} available</span></div>
              <div><Label htmlFor={`flat-quantity-${index}`}>Flats to sell</Label><Input id={`flat-quantity-${index}`} type="number" min={0} max={available} value={line.quantity} onChange={(event) => setFlatDrafts((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, quantity: Number(event.target.value) } : row))} /></div>
              <div><Label htmlFor={`flat-min-${index}`}>Lowest price per flat (Rs)</Label><Input id={`flat-min-${index}`} inputMode="numeric" value={line.minimum} onChange={(event) => setFlatDrafts((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, minimum: event.target.value } : row))} disabled={line.quantity === 0} required={line.quantity > 0} /></div>
              <div><Label htmlFor={`flat-max-${index}`}>Highest price per flat (Rs)</Label><Input id={`flat-max-${index}`} inputMode="numeric" value={line.maximum} onChange={(event) => setFlatDrafts((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, maximum: event.target.value } : row))} disabled={line.quantity === 0} required={line.quantity > 0} /></div>
            </div>;
          })}</div>
          <p className="rounded-md bg-muted p-3 text-sm">{flatCount} flats included · total expected recovery <strong>Rs {flatMinTotal.toLocaleString()} – Rs {flatMaxTotal.toLocaleString()}</strong></p>
          <div className="space-y-1.5"><Label htmlFor="entry-details">Notes (optional)</Label><Input id="entry-details" value={details} onChange={(event) => setDetails(event.target.value)} /></div>
        </> : mode === "estimate" && kind === "revenue" && !legacyRecovery ? <>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5"><Label htmlFor="entry-unit-minimum">Lowest expected selling price per unit (Rs) *</Label><Input id="entry-unit-minimum" inputMode="numeric" value={unitMinimum} onChange={(event) => setUnitMinimum(event.target.value)} placeholder="e.g. 5,000,000" required /></div>
            <div className="space-y-1.5"><Label htmlFor="entry-unit-maximum">Highest expected selling price per unit (Rs) *</Label><Input id="entry-unit-maximum" inputMode="numeric" value={unitMaximum} onChange={(event) => setUnitMaximum(event.target.value)} placeholder="e.g. 6,000,000" required /></div>
          </div>
          {recoveryQuantity > 0 && wholeRupees(unitMinimum) !== null && wholeRupees(unitMaximum) !== null && <p className="rounded-md bg-muted p-3 text-sm">For {recoveryQuantity} {recoverySpace}: total expected recovery <strong>Rs {(wholeRupees(unitMinimum)! * recoveryQuantity).toLocaleString()} – Rs {(wholeRupees(unitMaximum)! * recoveryQuantity).toLocaleString()}</strong></p>}
          <div className="space-y-1.5"><Label htmlFor="entry-details">Notes (optional)</Label><Input id="entry-details" value={details} onChange={(event) => setDetails(event.target.value)} placeholder="e.g. Expected sale after completion" /></div>
        </> : mode === "estimate" ? <>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="entry-minimum">Minimum estimate (Rs) *</Label>
              <Input id="entry-minimum" inputMode="numeric" value={minimum}
                onChange={(event) => setMinimum(event.target.value)} placeholder="e.g. 500,000" required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="entry-maximum">Maximum estimate (Rs) *</Label>
              <Input id="entry-maximum" inputMode="numeric" value={maximum}
                onChange={(event) => setMaximum(event.target.value)} placeholder="e.g. 800,000" required />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="entry-details">Quantity or notes</Label>
            <Input id="entry-details" value={details} onChange={(event) => setDetails(event.target.value)}
              placeholder="e.g. 60 tons, 3 flats × 2 rooms" />
          </div>
        </> : <>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="entry-date">Payment date *</Label>
              <Input id="entry-date" type="date" value={date} onChange={(event) => setDate(event.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="entry-amount">Amount paid (Rs) *</Label>
              <Input id="entry-amount" inputMode="numeric" value={amount}
                onChange={(event) => setAmount(event.target.value)} placeholder="e.g. 50,000" required />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="entry-method">Payment method</Label>
              <select id="entry-method" value={method} onChange={(event) => setMethod(event.target.value as typeof method)}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
                <option value="cash">Cash</option><option value="bank">Bank</option>
                <option value="cheque">Cheque</option><option value="other">Other</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="entry-reference">Reference</Label>
              <Input id="entry-reference" value={reference} onChange={(event) => setReference(event.target.value)}
                placeholder="Optional receipt or transfer ID" />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">This payment will also appear in the project ledger.</p>
        </>}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      </form>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
        <Button type="submit" form="project-entry-form" disabled={pending || mode === "estimate" && kind === "revenue" && !legacyRecovery && inventory.length === 0}>{pending ? "Saving…" : "Save"}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
