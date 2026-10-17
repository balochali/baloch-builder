import { useState } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { SettingsPage } from "@/features/settings/pages/SettingsPage";
import { BackupSection } from "@/features/settings/components/BackupSection";
import { PasswordSection, passwordProblem } from "@/features/settings/components/PasswordSection";
import { ProfileSection } from "@/features/settings/components/ProfileSection";
import { formatBytes } from "@/features/settings/format";
import type { BackupStatus, Profile } from "@/features/settings/api";

vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn() }));
vi.mock("@/data/repositories/udhaarRepository", () => ({ clearAllUdhaarData: vi.fn() }));

type Args = Record<string, unknown> | undefined;
type Routes = Record<string, (args: Args) => unknown>;

/** Makes `invoke` answer by command name; an unexpected command fails the test loudly. */
function routeInvoke(routes: Routes) {
    vi.mocked(invoke).mockImplementation((async (command: string, args?: unknown) => {
        const route = routes[command];
        if (!route) throw new Error(`Unexpected command: ${command}`);
        return route(args as Args);
    }) as unknown as typeof invoke);
}

function calls(command: string) {
    return vi.mocked(invoke).mock.calls.filter(([name]) => name === command);
}

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

const profile: Profile = { username: "ali", fullName: "", email: "" };

beforeEach(() => {
    vi.mocked(invoke).mockReset();
    vi.mocked(listen).mockReset();
    vi.mocked(listen).mockResolvedValue(() => undefined);
});

describe("passwordProblem", () => {
    it("reports the first problem in a sensible order", () => {
        expect(passwordProblem("", "long-enough-password", "long-enough-password")).toMatch(/current password/);
        expect(passwordProblem("old", "short", "short")).toMatch(/at least 12/);
        expect(passwordProblem("old", "long-enough-password", "different-password!")).toMatch(/do not match/);
        expect(passwordProblem("same-long-password", "same-long-password", "same-long-password")).toMatch(/different/);
        expect(passwordProblem("old", "long-enough-password", "long-enough-password")).toBe("");
    });
});

describe("formatBytes", () => {
    it("uses friendly units", () => {
        expect(formatBytes(512)).toBe("512 B");
        expect(formatBytes(1536)).toBe("1.5 KB");
        expect(formatBytes(5 * 1024 * 1024)).toBe("5.0 MB");
        expect(formatBytes(null)).toBe("—");
    });
});

describe("ProfileSection", () => {
    it("saves the name and email and then waits for further edits", async () => {
        routeInvoke({
            update_profile: (args) => ({ username: "ali", fullName: args?.fullName, email: args?.email }),
        });
        const onSaved = vi.fn();
        render(<ProfileSection profile={profile} onSaved={onSaved} />);
        expect(screen.getByLabelText("Username")).toBeDisabled();
        expect(screen.getByRole("button", { name: "Save details" })).toBeDisabled();

        fireEvent.change(screen.getByLabelText("Full name"), { target: { value: "Ali Baloch" } });
        fireEvent.change(screen.getByLabelText("Email"), { target: { value: "ali@example.com" } });
        fireEvent.click(screen.getByRole("button", { name: "Save details" }));

        await screen.findByRole("status");
        expect(calls("update_profile")[0][1]).toEqual({ fullName: "Ali Baloch", email: "ali@example.com" });
        expect(onSaved).toHaveBeenCalledWith({ username: "ali", fullName: "Ali Baloch", email: "ali@example.com" });
    });

    it("shows the message when saving fails", async () => {
        routeInvoke({ update_profile: () => Promise.reject("Enter a valid email address, or leave it empty.") });
        render(<ProfileSection profile={profile} onSaved={vi.fn()} />);
        fireEvent.change(screen.getByLabelText("Email"), { target: { value: "nope" } });
        fireEvent.click(screen.getByRole("button", { name: "Save details" }));
        expect(await screen.findByRole("alert")).toHaveTextContent("valid email");
    });
});

describe("PasswordSection", () => {
    function fill(current: string, next: string, confirm: string) {
        fireEvent.change(screen.getByLabelText("Current password"), { target: { value: current } });
        fireEvent.change(screen.getByLabelText("New password"), { target: { value: next } });
        fireEvent.change(screen.getByLabelText("Confirm new password"), { target: { value: confirm } });
        fireEvent.click(screen.getByRole("button", { name: "Change password" }));
    }

    it("rejects bad input without contacting the app", async () => {
        routeInvoke({});
        render(<PasswordSection />);
        fill("old-password-123", "short", "short");
        expect(await screen.findByRole("alert")).toHaveTextContent("at least 12");
        fill("old-password-123", "a-long-new-password", "another-long-one");
        await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("do not match"));
        expect(calls("change_password")).toHaveLength(0);
    });

    it("changes the password and clears the fields", async () => {
        routeInvoke({ change_password: () => null });
        render(<PasswordSection />);
        fill("old-password-123", "a-long-new-password", "a-long-new-password");
        await screen.findByRole("status");
        expect(calls("change_password")[0][1]).toEqual({
            currentPassword: "old-password-123",
            newPassword: "a-long-new-password",
        });
        expect(screen.getByLabelText("Current password")).toHaveValue("");
        expect(screen.getByLabelText("New password")).toHaveValue("");
        expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });

    it("shows the app's message when the current password is wrong and keeps what was typed", async () => {
        routeInvoke({ change_password: () => Promise.reject("Your current password is incorrect.") });
        render(<PasswordSection />);
        fill("wrong", "a-long-new-password", "a-long-new-password");
        expect(await screen.findByRole("alert")).toHaveTextContent("current password is incorrect");
        expect(screen.getByLabelText("New password")).toHaveValue("a-long-new-password");
    });

    it("can reveal the typed passwords", () => {
        render(<PasswordSection />);
        expect(screen.getByLabelText("New password")).toHaveAttribute("type", "password");
        fireEvent.click(screen.getByLabelText("Show passwords"));
        expect(screen.getByLabelText("New password")).toHaveAttribute("type", "text");
    });
});

function Harness({ initial }: { initial: BackupStatus }) {
    const [current, setCurrent] = useState(initial);
    return <BackupSection status={current} onStatus={setCurrent} />;
}

describe("BackupSection", () => {
    it("asks for Google credentials first and then offers to connect", async () => {
        routeInvoke({
            save_google_credentials: () => ({ ...status, connected: false, googleEmail: null }),
            connect_google_drive: () => status,
        });
        render(<Harness initial={{ ...status, credentialsSaved: false, connected: false, googleEmail: null, clientId: "" }} />);
        const save = screen.getByRole("button", { name: "Save credentials" });
        expect(save).toBeDisabled();
        fireEvent.change(screen.getByLabelText("Google Client ID"), { target: { value: " my-id.apps.googleusercontent.com " } });
        fireEvent.change(screen.getByLabelText("Google Client Secret"), { target: { value: "GOCSPX-secret" } });
        fireEvent.click(save);

        fireEvent.click(await screen.findByRole("button", { name: "Connect Google Drive" }));
        expect(await screen.findByText("ali@gmail.com")).toBeInTheDocument();
        expect(calls("save_google_credentials")[0][1]).toEqual({
            clientId: " my-id.apps.googleusercontent.com ",
            clientSecret: "GOCSPX-secret",
        });
        expect(screen.queryByLabelText("Google Client Secret")).not.toBeInTheDocument();
    });

    it("explains how to publish the Google app so sign-in does not expire", () => {
        render(<Harness initial={{ ...status, credentialsSaved: false, connected: false }} />);
        expect(screen.getByText(/In production/)).toBeInTheDocument();
        expect(screen.getByText(/every 7 days/)).toBeInTheDocument();
    });

    it("runs a backup now and reports success", async () => {
        routeInvoke({
            run_backup_now: () => ({
                ...status,
                lastStatus: "ok",
                lastSuccessAt: "2026-10-10T09:00:00Z",
                lastSizeBytes: 5 * 1024 * 1024,
            }),
        });
        render(<Harness initial={status} />);
        expect(screen.getByText("No backup yet")).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: "Back up now" }));
        expect(await screen.findByRole("status")).toHaveTextContent("Backup finished");
        expect(screen.getByText(/5\.0 MB/)).toBeInTheDocument();
        expect(screen.queryByText("No backup yet")).not.toBeInTheDocument();
    });

    it("reports a failed backup and refreshes the last-attempt line", async () => {
        routeInvoke({
            run_backup_now: () => Promise.reject("Your Google Drive is full. Free some space and try again."),
            get_backup_status: () => ({
                ...status,
                lastStatus: "error",
                lastAttemptAt: "2026-10-10T09:00:00Z",
                lastMessage: "Your Google Drive is full. Free some space and try again.",
            }),
        });
        render(<Harness initial={status} />);
        fireEvent.click(screen.getByRole("button", { name: "Back up now" }));
        expect(await screen.findByRole("alert")).toHaveTextContent("Drive is full");
        expect(await screen.findByText(/The last attempt/)).toHaveTextContent("failed");
        expect(screen.getByRole("button", { name: "Back up now" })).toBeEnabled();
    });

    it("turns automatic backups on and changes how often and how many to keep", async () => {
        routeInvoke({
            set_backup_schedule: (args) => ({
                ...status,
                autoEnabled: args?.enabled,
                frequency: args?.frequency,
                keep: args?.keep,
            }),
        });
        render(<Harness initial={status} />);
        fireEvent.click(screen.getByLabelText("Back up automatically"));
        await waitFor(() => expect(screen.getByLabelText("Back up automatically")).toBeChecked());
        expect(calls("set_backup_schedule")[0][1]).toEqual({ enabled: true, frequency: "daily", keep: 10 });

        fireEvent.change(screen.getByLabelText("How often"), { target: { value: "weekly" } });
        await waitFor(() => expect(screen.getByLabelText("How often")).toHaveValue("weekly"));
        expect(calls("set_backup_schedule")[1][1]).toEqual({ enabled: true, frequency: "weekly", keep: 10 });

        fireEvent.change(screen.getByLabelText("Backups to keep in Drive"), { target: { value: "20" } });
        await waitFor(() => expect(screen.getByLabelText("Backups to keep in Drive")).toHaveValue("20"));
        expect(calls("set_backup_schedule")[2][1]).toEqual({ enabled: true, frequency: "weekly", keep: 20 });
    });

    it("asks before disconnecting", async () => {
        routeInvoke({
            disconnect_google_drive: () => ({ ...status, connected: false, googleEmail: null }),
        });
        render(<Harness initial={status} />);
        fireEvent.click(screen.getByRole("button", { name: "Disconnect" }));
        fireEvent.click(screen.getByRole("button", { name: "Keep connected" }));
        expect(calls("disconnect_google_drive")).toHaveLength(0);

        fireEvent.click(screen.getByRole("button", { name: "Disconnect" }));
        fireEvent.click(screen.getByRole("button", { name: "Yes, disconnect" }));
        await screen.findByRole("button", { name: "Connect Google Drive" });
        expect(calls("disconnect_google_drive")[0][1]).toEqual({ forgetCredentials: false });
    });

    it("blocks a second backup while one is running", () => {
        render(<Harness initial={{ ...status, running: true }} />);
        expect(screen.getByRole("button", { name: "Backing up…" })).toBeDisabled();
    });
});

describe("SettingsPage account and backup sections", () => {
    it("shows a summary of the current settings and follows backups that finish while it is open", async () => {
        routeInvoke({
            get_profile: () => ({ username: "ali", fullName: "Ali Baloch", email: "ali@example.com" }),
            get_backup_status: () => status,
            get_data_locations: () => ({
                dataDir: "C:/Users/ali/AppData/Local/app",
                databasePath: "C:/Users/ali/AppData/Roaming/app/baloch-builder.db",
                attachmentsDir: "C:/Users/ali/AppData/Local/app/attachments",
            }),
        });
        let finished: ((event: { payload: BackupStatus }) => void) | undefined;
        vi.mocked(listen).mockImplementation((async (_name: string, handler: typeof finished) => {
            finished = handler;
            return () => undefined;
        }) as unknown as typeof listen);

        render(<SettingsPage />);
        expect(await screen.findByText("Ali Baloch (ali)")).toBeInTheDocument();
        expect(screen.getByText("Connected as ali@gmail.com")).toBeInTheDocument();
        expect(screen.getByText("Off")).toBeInTheDocument();
        expect(screen.getByText("C:/Users/ali/AppData/Roaming/app/baloch-builder.db")).toBeInTheDocument();
        expect(screen.getByRole("heading", { name: "Change password" })).toBeInTheDocument();
        expect(screen.getByRole("heading", { name: "Backup to Google Drive" })).toBeInTheDocument();
        expect(screen.queryByText(/not available yet/i)).not.toBeInTheDocument();

        await waitFor(() => expect(finished).toBeDefined());
        act(() => {
            finished?.({
                payload: {
                    ...status,
                    autoEnabled: true,
                    lastStatus: "ok",
                    lastSuccessAt: "2026-10-10T09:00:00Z",
                    lastSizeBytes: 2048,
                },
            });
        });
        expect(await screen.findByText(/On, every day, keeping the last 10/)).toBeInTheDocument();
        // The last backup is shown in the summary and in the backup section itself.
        expect(screen.getAllByText(/2\.0 KB/, { selector: "dd" })).toHaveLength(2);
    });

    it("still renders when the desktop app is not available", async () => {
        vi.mocked(invoke).mockRejectedValue(new Error("not running in Tauri"));
        render(<SettingsPage />);
        expect(await screen.findByRole("heading", { name: "Current settings" })).toBeInTheDocument();
        expect(screen.getByRole("heading", { name: "Change password" })).toBeInTheDocument();
        expect(screen.queryByRole("heading", { name: "Backup to Google Drive" })).not.toBeInTheDocument();
        expect(screen.queryByRole("heading", { name: "Your details" })).not.toBeInTheDocument();
    });
});