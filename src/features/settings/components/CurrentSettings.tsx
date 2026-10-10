import { SlidersHorizontal } from "lucide-react";
import type { BackupStatus, DataLocations, Profile } from "../api";
import { formatBytes, formatDateTime, THEME_LABELS } from "../format";
import "../settings-account.css";

interface CurrentSettingsProps {
    theme: string;
    profile: Profile | null;
    backup: BackupStatus | null;
    locations: DataLocations | null;
}

function googleDriveSummary(backup: BackupStatus): string {
    if (backup.connected) return `Connected${backup.googleEmail ? ` as ${backup.googleEmail}` : ""}`;
    return backup.credentialsSaved ? "Credentials saved, not connected yet" : "Not set up";
}

function automaticSummary(backup: BackupStatus): string {
    if (!backup.connected) return "Off (connect Google Drive first)";
    if (!backup.autoEnabled) return "Off";
    return `On, ${backup.frequency === "daily" ? "every day" : "every week"}, keeping the last ${backup.keep}`;
}

function lastBackupSummary(backup: BackupStatus): string {
    if (backup.lastStatus === "ok" && backup.lastSuccessAt) {
        return `${formatDateTime(backup.lastSuccessAt)} (${formatBytes(backup.lastSizeBytes)})`;
    }
    if (backup.lastStatus === "error") return `Failed on ${formatDateTime(backup.lastAttemptAt)}`;
    return "No backup yet";
}

/** A read-only summary of how the app is set up right now. */
export function CurrentSettings({ theme, profile, backup, locations }: CurrentSettingsProps) {
    const rows: Array<[string, string]> = [];
    if (profile) {
        rows.push(["Signed in as", profile.fullName ? `${profile.fullName} (${profile.username})` : profile.username]);
        rows.push(["Email", profile.email || "Not added"]);
    }
    rows.push(["Appearance", THEME_LABELS[theme] ?? theme]);
    if (backup) {
        rows.push(["Google Drive", googleDriveSummary(backup)]);
        rows.push(["Automatic backup", automaticSummary(backup)]);
        rows.push(["Last backup", lastBackupSummary(backup)]);
        if (backup.connected && backup.autoEnabled && backup.nextDueAt) {
            rows.push(["Next automatic backup", formatDateTime(backup.nextDueAt)]);
        }
    }
    if (locations) {
        rows.push(["Database file", locations.databasePath]);
        rows.push(["Attachments folder", locations.attachmentsDir]);
    }

    return (
        <section className="settings-section" aria-labelledby="current-settings-heading">
            <SlidersHorizontal size={24} />
            <h2 id="current-settings-heading">Current settings</h2>
            <p>A quick look at how the app is set up right now.</p>
            <dl className="settings-facts settings-facts-wide">
                {rows.map(([label, value]) => (
                    <div key={label}>
                        <dt>{label}</dt>
                        <dd>{value}</dd>
                    </div>
                ))}
            </dl>
        </section>
    );
}