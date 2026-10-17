import { useState } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { SettingsPage } from "@/features/settings/pages/SettingsPage";
import { BackupSection } from "@/features/settings/components/BackupSection";
import type { BackupStatus } from "@/features/settings/api";

vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn() }));
vi.mock("@/data/repositories/udhaarRepository", () => ({ clearAllUdhaarData: vi.fn() }));

type Routes = Record<string, (args: unknown) => unknown>;

function routeInvoke(routes: Routes) {
    vi.mocked(invoke).mockImplementation((async (command: string, args?: unknown) => {
        const route = routes[command];
        if (!route) throw new Error(`Unexpected command: ${command}`);
        return route(args);
    }) as unknown as typeof invoke);
}

const calls = (command: string) =>
    vi.mocked(invoke).mock.calls.filter(([name]) => name === command);

const status: BackupStatus = {
    clientId: "id.apps.googleusercontent.com",
    credentialsSaved: true,
    connected: true,
    googleEmail: "ali@gmail.com",
    folderName: "Baloch Builder Backups",
    autoEnabled: false,
    frequency: "daily",
    keep: 10,
    lastAttemptAt: null,
    lastSuccessAt: null,
    lastStatus: null,
    lastMessage: null,
    lastSizeBytes: null,
    nextDueAt: null,
    running: false,
};

function Harness() {
    const [current, setCurrent] = useState(status);
    return <BackupSection status={current} onStatus={setCurrent} />;
}

beforeEach(() => {
    vi.mocked(invoke).mockReset();
    vi.mocked(listen).mockReset();
    vi.mocked(listen).mockResolvedValue(() => undefined);
});

describe("restore from Google Drive", () => {
    it("shows the newest backup and changes nothing until the user confirms", async () => {
        routeInvoke({
            find_latest_backup: () => ({
                name: "Baloch-Builder-backup-2026-10-10_09-00-00.zip",
                createdAt: "2026-10-10T09:00:00Z",
            }),
        });
        render(<Harness />);
        fireEvent.click(screen.getByRole("button", { name: "Restore latest backup" }));
        expect(await screen.findByText(/Newest backup:/)).toBeInTheDocument();
        expect(screen.getByText(/replaces all records and attachments/)).toBeInTheDocument();
        expect(calls("restore_latest_backup")).toHaveLength(0);

        fireEvent.click(screen.getByRole("button", { name: "Keep my current data" }));
        expect(screen.getByRole("button", { name: "Restore latest backup" })).toBeEnabled();
        expect(calls("restore_latest_backup")).toHaveLength(0);
        expect(calls("restart_app")).toHaveLength(0);
    });

    it("restores after confirmation and then restarts the app", async () => {
        routeInvoke({
            find_latest_backup: () => ({ name: "b.zip", createdAt: "2026-10-10T09:00:00Z" }),
            restore_latest_backup: () => ({
                name: "b.zip",
                createdAt: "2026-10-10T09:00:00Z",
                attachmentCount: 3,
            }),
            restart_app: () => undefined,
        });
        render(<Harness />);
        fireEvent.click(screen.getByRole("button", { name: "Restore latest backup" }));
        fireEvent.click(await screen.findByRole("button", { name: "Yes, restore and restart" }));
        expect(await screen.findByRole("status")).toHaveTextContent("Restarting the app");
        await waitFor(() => expect(calls("restart_app")).toHaveLength(1), { timeout: 4000 });
        expect(calls("restore_latest_backup")).toHaveLength(1);
    });

    it("does not restart when the restore fails, and shows why", async () => {
        routeInvoke({
            find_latest_backup: () => ({ name: "b.zip", createdAt: "2026-10-10T09:00:00Z" }),
            restore_latest_backup: () => {
                throw "The backup is damaged (its database does not match its checksum).";
            },
            get_backup_status: () => status,
        });
        render(<Harness />);
        fireEvent.click(screen.getByRole("button", { name: "Restore latest backup" }));
        fireEvent.click(await screen.findByRole("button", { name: "Yes, restore and restart" }));
        expect(await screen.findByRole("alert")).toHaveTextContent("damaged");
        expect(calls("restart_app")).toHaveLength(0);
        expect(screen.getByRole("button", { name: "Restore latest backup" })).toBeEnabled();
    });

    it("explains when there is no backup in Drive", async () => {
        routeInvoke({
            find_latest_backup: () => {
                throw "No backups were found in your Google Drive.";
            },
            get_backup_status: () => status,
        });
        render(<Harness />);
        fireEvent.click(screen.getByRole("button", { name: "Restore latest backup" }));
        expect(await screen.findByRole("alert")).toHaveTextContent("No backups were found");
        expect(
            screen.queryByRole("button", { name: "Yes, restore and restart" }),
        ).not.toBeInTheDocument();
    });

    it("shows the outcome of a restore that was applied while the app restarted", async () => {
        routeInvoke({
            get_profile: () => null,
            get_backup_status: () => null,
            get_data_locations: () => null,
            take_restore_notice: () => ({
                ok: true,
                message: 'Your data was restored from the backup "b.zip".',
            }),
        });
        render(<SettingsPage />);
        expect(await screen.findByRole("status")).toHaveTextContent("Your data was restored");
    });
});