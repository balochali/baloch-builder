import { useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import type { BackupStatus, DataLocations, Profile } from "../api";
import { formatBytes, formatDateTime, THEME_LABELS } from "../format";
import { SettingsCard, type BadgeTone } from "./SettingsCard";

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

function health(backup: BackupStatus): { text: string; tone: BadgeTone } {
    if (!backup.connected) return { text: "Backup not set up", tone: "warn" };
    if (backup.lastStatus === "error") return { text: "Backup needs attention", tone: "bad" };
    if (backup.lastStatus === "ok") return { text: "Backups healthy", tone: "ok" };
    return { text: "Ready for first backup", tone: "warn" };
}

function initials(profile: Profile): string {
    const source = (profile.fullName || profile.username).trim();
    const parts = source.split(/\s+/).filter(Boolean);
    const letters = parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : source.slice(0, 2);
    return letters.toUpperCase();
}

function PathTile({ label, value }: { label: string; value: string }) {
    const [copied, setCopied] = useState(false);
    async function copy() {
        try {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1500);
        } catch {
            setCopied(false);
        }
    }
    return (
        <div className="sx-tile-wide sx-tile-path">
            <div className="sx-tile-head">
                <dt>{label}</dt>
                <button
                    type="button"
                    className="sx-copy"
                    onClick={() => void copy()}
                    aria-label={`Copy ${label}`}
                >
                    {copied ? "Copied" : "Copy"}
                </button>
            </div>
            <dd>{value}</dd>
        </div>
    );
}

/** A read-only summary of how the app is set up right now. */
export function CurrentSettings({ theme, profile, backup, locations }: CurrentSettingsProps) {
    return (
        <SettingsCard
            id="overview"
            icon={SlidersHorizontal}
            title="Current settings"
            description="A quick look at how the app is set up right now."
            badge={backup ? health(backup) : undefined}
        >
            <dl className="settings-facts">
                {profile && (
                    <div className="sx-tile-wide sx-who">
                        <span className="sx-avatar" aria-hidden="true">
                            {initials(profile)}
                        </span>
                        <div>
                            <dt>Signed in as</dt>
                            <dd>
                                {profile.fullName ? `${profile.fullName} (${profile.username})` : profile.username}
                            </dd>
                        </div>
                    </div>
                )}
                {profile && (
                    <div>
                        <dt>Email</dt>
                        <dd>{profile.email || "Not added"}</dd>
                    </div>
                )}
                <div>
                    <dt>Appearance</dt>
                    <dd>{THEME_LABELS[theme] ?? theme}</dd>
                </div>
                {backup && (
                    <>
                        <div>
                            <dt>Google Drive</dt>
                            <dd>{googleDriveSummary(backup)}</dd>
                        </div>
                        <div>
                            <dt>Automatic backup</dt>
                            <dd>{automaticSummary(backup)}</dd>
                        </div>
                        <div>
                            <dt>Last backup</dt>
                            <dd>{lastBackupSummary(backup)}</dd>
                        </div>
                        {backup.connected && backup.autoEnabled && backup.nextDueAt && (
                            <div>
                                <dt>Next automatic backup</dt>
                                <dd>{formatDateTime(backup.nextDueAt)}</dd>
                            </div>
                        )}
                    </>
                )}
                {locations && <PathTile label="Database file" value={locations.databasePath} />}
                {locations && <PathTile label="Attachments folder" value={locations.attachmentsDir} />}
            </dl>
        </SettingsCard>
    );
}