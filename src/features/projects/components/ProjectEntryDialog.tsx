import { useState, type FormEvent } from "react";
import { format } from "date-fns";
import { ActualCostInputSchema, EstimateInputSchema,
  type ActualCostInput, type EstimateInput } from "@/data/repositories/projectFinanceRepository";
import type { ProjectEstimate } from "@/domain/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type EntryMode = "estimate" | "actual";

interface Props {
  mode: EntryMode;
  projectId: string;
  estimate?: ProjectEstimate | null;
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

export function ProjectEntryDialog({ mode, projectId, estimate, onOpenChange, onEstimate, onActual }: Props) {
  const [kind, setKind] = useState<"cost" | "revenue">(estimate?.kind ?? "cost");
  const [title, setTitle] = useState(estimate?.title ?? "");
  const [details, setDetails] = useState(estimate?.details ?? "");
  const [minimum, setMinimum] = useState(estimate ? String(estimate.minimum_amount) : "");
  const [maximum, setMaximum] = useState(estimate ? String(estimate.maximum_amount) : "");
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
      const parsed = EstimateInputSchema.safeParse({
        project_id: projectId, kind, title, details,
        minimum_amount: wholeRupees(minimum), maximum_amount: wholeRupees(maximum),
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
    <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
      <DialogHeader><DialogTitle>{estimate ? "Edit Estimate Item" : mode === "estimate" ? "Add Estimate Item" : "Add Actual Cost"}</DialogTitle></DialogHeader>
      <form id="project-entry-form" onSubmit={save} className="space-y-4">
        {mode === "estimate" && <div className="space-y-1.5">
          <Label htmlFor="entry-kind">Item type</Label>
          <select id="entry-kind" value={kind} onChange={(event) => setKind(event.target.value as "cost" | "revenue")}
            className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
            <option value="cost">Expected cost</option>
            <option value="revenue">Expected recovery / revenue</option>
          </select>
        </div>}
        <div className="space-y-1.5">
          <Label htmlFor="entry-title">{mode === "estimate" ? "Item name" : "Cost description"} *</Label>
          <Input id="entry-title" value={title} onChange={(event) => setTitle(event.target.value)}
            placeholder={mode === "estimate" ? "e.g. Cement, plot price, flats" : "e.g. Cement payment"} required />
        </div>
        {mode === "estimate" ? <>
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
        <Button type="submit" form="project-entry-form" disabled={pending}>{pending ? "Saving…" : "Save"}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
