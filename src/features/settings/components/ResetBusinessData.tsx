import { useState } from "react";
import { resetBusinessData } from "@/data/repositories/resetRepository";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

export function ResetBusinessData() {
  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  async function reset() {
    if (busy || confirmation !== "RESET ALL DATA") return;
    setBusy(true);
    setError("");
    try {
      await resetBusinessData();
      setOpen(false);
      setDone(true);
    } catch {
      setError(
        "Reset failed. Your records have not been cleared. Restart the updated desktop app and try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="settings-section">
      <h2>Reset all business data</h2>
      <p>
        Start testing with an empty workspace. Permanently removes all projects, land, contacts,
        partners, contributions, loans, repayments, purchases, estimates, document records, notes
        and business history, including archived records. Bank activity is cleared too.
      </p>
      <p>
        Your login, theme and the two account choices are kept. Previously attached files remain on
        disk; their document records are removed. This cannot be undone.
      </p>
      <Button
        variant="destructive"
        onClick={() => {
          setOpen(true);
          setConfirmation("");
          setError("");
          setDone(false);
        }}
      >
        Reset all business data
      </Button>
      {done && <p role="status">Business data cleared. You can start adding fresh test records.</p>}
      <Dialog
        open={open}
        onOpenChange={(value) => {
          if (!busy) setOpen(value);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset the entire workspace?</DialogTitle>
            <DialogDescription>
              All saved business records will be permanently deleted. Login and appearance settings
              remain. Back up anything you need before continuing.
            </DialogDescription>
          </DialogHeader>
          <Label htmlFor="reset-business-confirm">Type RESET ALL DATA to confirm</Label>
          <Input
            id="reset-business-confirm"
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            disabled={busy}
            autoComplete="off"
          />
          {error && (
            <p role="alert" className="text-destructive">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" disabled={busy} onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={reset}
              disabled={busy || confirmation !== "RESET ALL DATA"}
            >
              {busy ? "Resetting…" : "Permanently reset all business data"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
