import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { clearAllUdhaarData } from "@/data/repositories/udhaarRepository";
import { BackupSection } from "../components/BackupSection";
import { CurrentSettings } from "../components/CurrentSettings";
import { PasswordSection } from "../components/PasswordSection";
import { SettingsCard } from "../components/SettingsCard";
import { SettingsNav, type SettingsNavItem } from "../components/SettingsNav";
import { ResetBusinessData } from "../components/ResetBusinessData";
import { ProfileSection } from "../components/ProfileSection";
import { settingsApi, type BackupStatus, type DataLocations, type Profile } from "../api";
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
import { Database, Monitor, Moon, Palette, ShieldAlert, ShieldCheck, Sun } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { useThemeStore } from "@/stores/themeStore";
import "../settings-account.css";

export function SettingsPage() {
  const { theme, setTheme } = useThemeStore();
  const [clearOpen, setClearOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [clearing, setClearing] = useState(false);
  const [clearError, setClearError] = useState("");
  const [cleared, setCleared] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [backup, setBackup] = useState<BackupStatus | null>(null);
  const [locations, setLocations] = useState<DataLocations | null>(null);

  useEffect(() => {
    let active = true;
    void Promise.allSettled([
      settingsApi.getProfile(),
      settingsApi.getBackupStatus(),
      settingsApi.getDataLocations(),
    ]).then(([profileResult, backupResult, locationsResult]) => {
      if (!active) return;
      if (profileResult.status === "fulfilled") setProfile(profileResult.value ?? null);
      if (backupResult.status === "fulfilled") setBackup(backupResult.value ?? null);
      if (locationsResult.status === "fulfilled") setLocations(locationsResult.value ?? null);
    });
    return () => {
      active = false;
    };
  }, []);

  // An automatic backup can finish while this page is open; keep the status current.
  useEffect(() => {
    let active = true;
    let stopListening: (() => void) | undefined;
    listen<BackupStatus>("backup-finished", (event) => setBackup(event.payload))
      .then((stop) => {
        if (active) stopListening = stop;
        else stop();
      })
      .catch(() => undefined);
    return () => {
      active = false;
      stopListening?.();
    };
  }, []);

  const navItems: SettingsNavItem[] = [
    { id: "overview", label: "Overview" },
    ...(profile ? [{ id: "profile", label: "Your details" }] : []),
    { id: "security", label: "Password" },
    ...(backup ? [{ id: "backup", label: "Google Drive backup" }] : []),
    { id: "appearance", label: "Appearance" },
    { id: "data", label: "Data and access" },
    { id: "danger", label: "Danger zone" },
  ];

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
      <div className="settings-layout">
        <SettingsNav items={navItems} />
        <div className="settings-stack">
          <CurrentSettings theme={theme} profile={profile} backup={backup} locations={locations} />
          {profile && <ProfileSection profile={profile} onSaved={setProfile} />}
          <PasswordSection />
          {backup && <BackupSection status={backup} onStatus={setBackup} />}
          <SettingsCard
            id="appearance"
            icon={Palette}
            title="Appearance"
            description="Choose a theme. Your preference is saved on this device."
          >
            <div className="sx-themes">
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
                  className="sx-theme"
                  aria-pressed={theme === value}
                  onClick={() => setTheme(value)}
                >
                  <span className={`sx-preview sx-preview-${value}`} aria-hidden="true">
                    <i />
                    <b />
                  </span>
                  <strong>
                    <Icon size={16} />
                    {label}
                  </strong>
                  <small>{theme === value ? "Selected" : "Select theme"}</small>
                </button>
              ))}
            </div>
          </SettingsCard>
          <SettingsCard
            id="data"
            icon={Database}
            title="Your data and access"
            description="Where your records are kept and how the app is protected."
          >
            <div className="sx-info">
              <div>
                <Database size={20} aria-hidden="true" />
                <h3>Your data</h3>
                <p>
                  Business records are stored locally in the app&apos;s SQLite database. Receipt and
                  document files are stored in the attachments folder.
                </p>
                <p>
                  Use &quot;Backup to Google Drive&quot; above to keep a safe copy of both the
                  database and the attachments, manually or on a schedule.
                </p>
              </div>
              <div>
                <ShieldCheck size={20} aria-hidden="true" />
                <h3>Account access</h3>
                <p>
                  Your local account protects access to the desktop workspace. Keep your password
                  somewhere safe.
                </p>
                <p>
                  You can change your password above. Password recovery is not available, so a
                  forgotten password cannot be reset.
                </p>
              </div>
            </div>
          </SettingsCard>
          <SettingsCard
            id="danger"
            icon={ShieldAlert}
            title="Danger zone"
            description="These actions permanently delete records. Make a backup first."
            danger
            bodyClassName="sx-danger-body"
          >
            <div className="sx-danger-row">
              <h3>Credit / Udhaar data</h3>
              <p>
                Permanently delete all Udhaar loans and their repayment history, including archived
                records. Contacts, partners, projects and other records are kept.
              </p>
              <p>
                This cannot be undone. Back up your database first if you may need these records
                later.
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
                  All Udhaar loans and repayments have been deleted. Your contacts and other records
                  are unchanged.
                </p>
              )}
            </div>
            <ResetBusinessData />
          </SettingsCard>
        </div>
      </div>
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
    </div>
  );
}
