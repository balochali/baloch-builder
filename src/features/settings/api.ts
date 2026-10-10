/**
 * features/settings/api.ts — typed wrappers around the Tauri commands used by the Settings page
 * (profile, password, data locations and Google Drive backup).
 */
import { invoke } from "@tauri-apps/api/core";

export interface Profile {
    username: string;
    fullName: string;
    email: string;
}

export interface BackupStatus {
    clientId: string;
    /** A Client ID and Client Secret are both saved. */
    credentialsSaved: boolean;
    connected: boolean;
    googleEmail: string | null;
    folderName: string;
    autoEnabled: boolean;
    frequency: "daily" | "weekly";
    keep: number;
    lastAttemptAt: string | null;
    lastSuccessAt: string | null;
    lastStatus: "ok" | "error" | null;
    lastMessage: string | null;
    lastSizeBytes: number | null;
    nextDueAt: string | null;
    running: boolean;
}

export interface DataLocations {
    dataDir: string;
    databasePath: string;
    attachmentsDir: string;
}

export const settingsApi = {
    getProfile: () => invoke<Profile | null>("get_profile"),
    updateProfile: (fullName: string, email: string) =>
        invoke<Profile>("update_profile", { fullName, email }),
    changePassword: (currentPassword: string, newPassword: string) =>
        invoke<void>("change_password", { currentPassword, newPassword }),
    getDataLocations: () => invoke<DataLocations | null>("get_data_locations"),
    getBackupStatus: () => invoke<BackupStatus | null>("get_backup_status"),
    saveGoogleCredentials: (clientId: string, clientSecret: string) =>
        invoke<BackupStatus>("save_google_credentials", { clientId, clientSecret }),
    connectGoogleDrive: () => invoke<BackupStatus>("connect_google_drive"),
    disconnectGoogleDrive: (forgetCredentials: boolean) =>
        invoke<BackupStatus>("disconnect_google_drive", { forgetCredentials }),
    setBackupSchedule: (enabled: boolean, frequency: "daily" | "weekly", keep: number) =>
        invoke<BackupStatus>("set_backup_schedule", { enabled, frequency, keep }),
    runBackupNow: () => invoke<BackupStatus>("run_backup_now"),
};

/** Tauri rejects with the plain error string from Rust; turn anything into readable text. */
export function errorText(cause: unknown): string {
    if (typeof cause === "string" && cause.trim()) return cause;
    if (cause instanceof Error && cause.message) return cause.message;
    return "Something went wrong. Please try again.";
}