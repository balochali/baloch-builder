import { useState, type FormEvent } from "react";
import { CloudUpload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { errorText, settingsApi, type BackupStatus } from "../api";
import { formatBytes, formatDateTime } from "../format";
import "../settings-account.css";

type Busy = null | "credentials" | "connect" | "backup" | "disconnect" | "schedule";
type Notice = { kind: "ok" | "error"; text: string } | null;

const KEEP_CHOICES = [5, 10, 20, 30];

interface BackupSectionProps {
    status: BackupStatus;
    onStatus: (status: BackupStatus) => void;
}

export function BackupSection({ status, onStatus }: BackupSectionProps) {
    const [busy, setBusy] = useState<Busy>(null);
    const [notice, setNotice] = useState<Notice>(null);
    const [clientId, setClientId] = useState(status.clientId);
    const [clientSecret, setClientSecret] = useState("");
    const [editingCredentials, setEditingCredentials] = useState(false);
    const [confirmingDisconnect, setConfirmingDisconnect] = useState(false);
    const setupVisible = !status.credentialsSaved || editingCredentials;
    const working = busy !== null || status.running;

    async function run(
        kind: Exclude<Busy, null>,
        action: () => Promise<BackupStatus>,
        success?: string,
    ): Promise<boolean> {
        if (busy) return false;
        setBusy(kind);
        setNotice(null);
        try {
            onStatus(await action());
            if (success) setNotice({ kind: "ok", text: success });
            return true;
        } catch (cause) {
            setNotice({ kind: "error", text: errorText(cause) });
            if (kind === "backup") {
                // The failure was recorded by the app; refresh so the "last backup" line is current.
                void settingsApi
                    .getBackupStatus()
                    .then((fresh) => fresh && onStatus(fresh))
                    .catch(() => undefined);
            }
            return false;
        } finally {
            setBusy(null);
        }
    }

    async function saveCredentials(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const saved = await run(
            "credentials",
            () => settingsApi.saveGoogleCredentials(clientId, clientSecret),
            "Saved. Now connect your Google account.",
        );
        if (saved) {
            setClientSecret("");
            setEditingCredentials(false);
        }
    }

    function changeSchedule(next: { enabled?: boolean; frequency?: "daily" | "weekly"; keep?: number }) {
        void run("schedule", () =>
            settingsApi.setBackupSchedule(
                next.enabled ?? status.autoEnabled,
                next.frequency ?? status.frequency,
                next.keep ?? status.keep,
            ),
        );
    }

    return (
        <section className="settings-section" aria-labelledby="backup-heading">
            <CloudUpload size={24} />
            <h2 id="backup-heading">Backup to Google Drive</h2>
            <p>
                Sends a complete copy of your records, including the database and all attached receipts,
                photos and documents, to a private folder in your own Google Drive. The app can only see
                the backup files it created itself. Your login password is never included.
            </p>

            {setupVisible && (
                <form className="settings-form" onSubmit={saveCredentials}>
                    <div className="settings-field">
                        <Label htmlFor="google-client-id">Google Client ID</Label>
                        <Input
                            id="google-client-id"
                            value={clientId}
                            autoComplete="off"
                            spellCheck={false}
                            placeholder="1234567890-abc….apps.googleusercontent.com"
                            onChange={(event) => setClientId(event.target.value)}
                            disabled={busy !== null}
                        />
                    </div>
                    <div className="settings-field">
                        <Label htmlFor="google-client-secret">Google Client Secret</Label>
                        <Input
                            id="google-client-secret"
                            type="password"
                            value={clientSecret}
                            autoComplete="off"
                            spellCheck={false}
                            onChange={(event) => setClientSecret(event.target.value)}
                            disabled={busy !== null}
                        />
                        <small>
                            Kept in this computer&apos;s secure credential store, not in the database or a file.
                        </small>
                    </div>
                    <details className="settings-help">
                        <summary>How do I get these?</summary>
                        <ol>
                            <li>
                                Open console.cloud.google.com, sign in with the Gmail account you want to use, and
                                create a project (any name, for example &quot;Baloch Builder&quot;).
                            </li>
                            <li>
                                Go to APIs &amp; Services, then Library. Search for &quot;Google Drive API&quot; and
                                click Enable.
                            </li>
                            <li>
                                Set up the OAuth consent screen (also called Google Auth Platform): choose External,
                                enter an app name and your email, and add the scope
                                &quot;…/auth/drive.file&quot;.
                            </li>
                            <li>
                                Publish the app so its status is &quot;In production&quot;. While it stays in
                                &quot;Testing&quot;, Google signs you out every 7 days and automatic backups stop.
                            </li>
                            <li>
                                Go to Credentials, choose Create credentials, then OAuth client ID, and pick
                                &quot;Desktop app&quot; as the type.
                            </li>
                            <li>Copy the Client ID and Client secret into the boxes above and save.</li>
                        </ol>
                        <p>Menu names in Google Cloud change from time to time, but the steps stay the same.</p>
                    </details>
                    <div className="settings-actions">
                        <Button type="submit" disabled={busy !== null || !clientId.trim() || !clientSecret.trim()}>
                            {busy === "credentials" ? "Saving…" : "Save credentials"}
                        </Button>
                        {status.credentialsSaved && (
                            <Button
                                type="button"
                                variant="outline"
                                disabled={busy !== null}
                                onClick={() => {
                                    setEditingCredentials(false);
                                    setClientSecret("");
                                    setClientId(status.clientId);
                                }}
                            >
                                Cancel
                            </Button>
                        )}
                    </div>
                </form>
            )}

            {!setupVisible && !status.connected && (
                <div className="settings-form">
                    <p>Your Google credentials are saved. Connect your Google account to start backing up.</p>
                    {busy === "connect" && (
                        <p className="settings-message">
                            Waiting for Google. Finish signing in in your browser, then come back to this window
                            (this waits up to 3 minutes).
                        </p>
                    )}
                    <div className="settings-actions">
                        <Button disabled={busy !== null} onClick={() => void run("connect", settingsApi.connectGoogleDrive, "Google Drive is connected.")}>
                            {busy === "connect" ? "Waiting for Google…" : "Connect Google Drive"}
                        </Button>
                        <Button variant="outline" disabled={busy !== null} onClick={() => setEditingCredentials(true)}>
                            Change Google credentials
                        </Button>
                    </div>
                </div>
            )}

            {!setupVisible && status.connected && (
                <div className="settings-form">
                    <dl className="settings-facts">
                        <div>
                            <dt>Google account</dt>
                            <dd>{status.googleEmail ?? "Connected"}</dd>
                        </div>
                        <div>
                            <dt>Drive folder</dt>
                            <dd>{status.folderName}</dd>
                        </div>
                        <div>
                            <dt>Last backup</dt>
                            <dd>
                                {status.lastStatus === "ok" && status.lastSuccessAt
                                    ? `${formatDateTime(status.lastSuccessAt)} (${formatBytes(status.lastSizeBytes)})`
                                    : "No backup yet"}
                            </dd>
                        </div>
                    </dl>
                    {status.lastStatus === "error" && status.lastMessage && (
                        <p className="settings-message settings-message-error">
                            The last attempt ({formatDateTime(status.lastAttemptAt)}) failed: {status.lastMessage}
                        </p>
                    )}
                    {(busy === "backup" || status.running) && (
                        <p className="settings-message">
                            Backing up… Large photos and documents can take a few minutes. Keep the app open.
                        </p>
                    )}
                    <div className="settings-actions">
                        <Button disabled={working} onClick={() => void run("backup", settingsApi.runBackupNow, "Backup finished and uploaded to Google Drive.")}>
                            {busy === "backup" || status.running ? "Backing up…" : "Back up now"}
                        </Button>
                    </div>

                    <div className="settings-subsection">
                        <h3>Automatic backup</h3>
                        <label className="settings-check">
                            <input
                                type="checkbox"
                                checked={status.autoEnabled}
                                disabled={busy !== null}
                                onChange={(event) => changeSchedule({ enabled: event.target.checked })}
                            />
                            Back up automatically
                        </label>
                        <div className="settings-inline">
                            <div className="settings-field">
                                <Label htmlFor="backup-frequency">How often</Label>
                                <select
                                    id="backup-frequency"
                                    className="settings-select"
                                    value={status.frequency}
                                    disabled={busy !== null}
                                    onChange={(event) => changeSchedule({ frequency: event.target.value as "daily" | "weekly" })}
                                >
                                    <option value="daily">Every day</option>
                                    <option value="weekly">Every week</option>
                                </select>
                            </div>
                            <div className="settings-field">
                                <Label htmlFor="backup-keep">Backups to keep in Drive</Label>
                                <select
                                    id="backup-keep"
                                    className="settings-select"
                                    value={status.keep}
                                    disabled={busy !== null}
                                    onChange={(event) => changeSchedule({ keep: Number(event.target.value) })}
                                >
                                    {Array.from(new Set([...KEEP_CHOICES, status.keep]))
                                        .sort((a, b) => a - b)
                                        .map((count) => (
                                            <option key={count} value={count}>
                                                Last {count}
                                            </option>
                                        ))}
                                </select>
                            </div>
                        </div>
                        <p>
                            Automatic backups run while Baloch Builder is open. If the app was closed when one was
                            due, it runs shortly after you open the app again. Older backups beyond the number
                            above are deleted from Drive.
                        </p>
                        {status.autoEnabled && status.nextDueAt && (
                            <p>Next automatic backup: {formatDateTime(status.nextDueAt)} or soon after.</p>
                        )}
                    </div>

                    <div className="settings-actions">
                        {confirmingDisconnect ? (
                            <>
                                <span className="settings-confirm-text">
                                    Disconnect Google Drive? Backups already in Drive are kept.
                                </span>
                                <Button
                                    variant="destructive"
                                    disabled={busy !== null}
                                    onClick={() => {
                                        setConfirmingDisconnect(false);
                                        void run("disconnect", () => settingsApi.disconnectGoogleDrive(false), "Google Drive has been disconnected.");
                                    }}
                                >
                                    Yes, disconnect
                                </Button>
                                <Button variant="outline" onClick={() => setConfirmingDisconnect(false)}>
                                    Keep connected
                                </Button>
                            </>
                        ) : (
                            <>
                                <Button variant="outline" disabled={working} onClick={() => setConfirmingDisconnect(true)}>
                                    Disconnect
                                </Button>
                                <Button variant="outline" disabled={working} onClick={() => setEditingCredentials(true)}>
                                    Change Google credentials
                                </Button>
                            </>
                        )}
                    </div>
                </div>
            )}

            {notice && (
                <p
                    role={notice.kind === "error" ? "alert" : "status"}
                    className={`settings-message settings-message-${notice.kind}`}
                >
                    {notice.text}
                </p>
            )}
        </section>
    );
}