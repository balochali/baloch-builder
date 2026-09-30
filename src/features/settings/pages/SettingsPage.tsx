import { ResetBusinessData } from "../components/ResetBusinessData";
import { useState } from "react";
import { clearAllUdhaarData } from "@/data/repositories/udhaarRepository";
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
import { Monitor, Moon, Sun, Database, ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { useThemeStore } from "@/stores/themeStore";

export function SettingsPage() {
  const { theme, setTheme } = useThemeStore();
  const [clearOpen, setClearOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [clearing, setClearing] = useState(false);
  const [clearError, setClearError] = useState("");
  const [cleared, setCleared] = useState(false);
  async function clearUdhaar() {
    if (confirmation !== "DELETE" || clearing) return;
    setClearing(true);
    setClearError("");
    try {
      await clearAllUdhaarData();
      setCleared(true);
      setClearOpen(false);
      setConfirmation("");
    } catch {
      setClearError(
        "Could not delete Udhaar data. No changes were saved. Restart the updated desktop app and try again.",
      );
    } finally {
      setClearing(false);
    }
  }
  return (
    <div className="settings-page">
      <PageHeader
        title="Settings"
        description="Make your workspace comfortable and understand where your records live."
      />
      <section className="settings-section">
        <h2>Appearance</h2>
        <p>Choose a theme. Your preference is saved on this device.</p>
        <div className="theme-options">
          {(
            [
              { value: "light", label: "Light", icon: Sun },
              { value: "dark", label: "Dark", icon: Moon },
              { value: "system", label: "Match device", icon: Monitor },
            ] as const
          ).map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              type="button"
              aria-pressed={theme === value}
              onClick={() => setTheme(value)}
            >
              <Icon size={24} />
              <strong>{label}</strong>
              <span>{theme === value ? "Selected" : "Select theme"}</span>
            </button>
          ))}
        </div>
      </section>
      <section className="settings-section">
        <h2>Credit / Udhaar data</h2>
        <p>
          Permanently delete all Udhaar loans and their repayment history, including archived
          records. Contacts, partners, projects and other records are kept.
        </p>
        <p>
          This cannot be undone. Back up your database first if you may need these records later.
        </p>
        <Button
          variant="destructive"
          onClick={() => {
            setClearOpen(true);
            setConfirmation("");
            setClearError("");
            setCleared(false);
          }}
        >
          Delete all Udhaar data
        </Button>
        {cleared && (
          <p role="status">
            All Udhaar loans and repayments have been deleted. Your contacts and other records are
            unchanged.
          </p>
        )}
      </section>
      <Dialog
        open={clearOpen}
        onOpenChange={(open) => {
          if (!clearing) setClearOpen(open);
        }}
      >
        <DialogContent
          onEscapeKeyDown={(event) => {
            if (clearing) event.preventDefault();
          }}
          onPointerDownOutside={(event) => {
            if (clearing) event.preventDefault();
          }}
        >
          <DialogHeader>
            <DialogTitle>Delete all Udhaar data?</DialogTitle>
            <DialogDescription>
              This permanently removes every Udhaar loan and repayment. It cannot be undone. Saved
              contacts and other modules will not be deleted.
            </DialogDescription>
          </DialogHeader>
          <Label htmlFor="confirm-udhaar-delete">Type DELETE to confirm</Label>
          <Input
            id="confirm-udhaar-delete"
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            disabled={clearing}
            autoComplete="off"
          />
          {clearError && (
            <p role="alert" className="text-sm text-destructive">
              {clearError}
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" disabled={clearing} onClick={() => setClearOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={clearing || confirmation !== "DELETE"}
              onClick={clearUdhaar}
            >
              {clearing ? "Deleting…" : "Permanently delete Udhaar data"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ResetBusinessData />
      <div className="settings-grid">
        <section className="settings-section">
          <Database size={24} />
          <h2>Your data</h2>
          <p>
            Business records are stored locally in the app's SQLite database. Receipt and document
            files are stored in the attachments folder.
          </p>
          <p>
            Keep a copy of both the database and attachments when making a backup. Automatic backups
            are not available yet.
          </p>
        </section>
        <section className="settings-section">
          <ShieldCheck size={24} />
          <h2>Account access</h2>
          <p>
            Your local account protects access to the desktop workspace. Keep your password
            somewhere safe.
          </p>
          <p>Password reset and account recovery are not available in the app yet.</p>
        </section>
      </div>
    </div>
  );
}
