import { useState, type FormEvent } from "react";
import { KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { errorText, settingsApi } from "../api";
import { SettingsCard } from "./SettingsCard";

export const MIN_PASSWORD_LENGTH = 12;

/** Returns a message for the first problem found, or an empty string when the form is valid. */
export function passwordProblem(current: string, next: string, confirm: string): string {
    if (!current) return "Enter your current password.";
    if (Array.from(next).length < MIN_PASSWORD_LENGTH) {
        return `Use a new password of at least ${MIN_PASSWORD_LENGTH} characters.`;
    }
    if (next !== confirm) return "The new passwords do not match.";
    if (next === current) return "Choose a password that is different from your current one.";
    return "";
}

export function PasswordSection() {
    const [current, setCurrent] = useState("");
    const [next, setNext] = useState("");
    const [confirm, setConfirm] = useState("");
    const [show, setShow] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [done, setDone] = useState(false);

    async function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (busy) return;
        setDone(false);
        const problem = passwordProblem(current, next, confirm);
        if (problem) {
            setError(problem);
            return;
        }
        setBusy(true);
        setError("");
        try {
            await settingsApi.changePassword(current, next);
            setCurrent("");
            setNext("");
            setConfirm("");
            setDone(true);
        } catch (cause) {
            setError(errorText(cause));
        } finally {
            setBusy(false);
        }
    }

    const type = show ? "text" : "password";
    const length = Array.from(next).length;
    const percent = Math.min(100, Math.round((length / MIN_PASSWORD_LENGTH) * 100));
    return (
        <SettingsCard
            id="security"
            icon={KeyRound}
            title="Change password"
            description="There is no password recovery, so keep your new password somewhere safe."
        >
            <form className="settings-form" onSubmit={submit}>
                <div className="sx-grid-2">
                    <div className="settings-field sx-span-2">
                        <Label htmlFor="password-current">Current password</Label>
                        <Input
                            id="password-current"
                            type={type}
                            value={current}
                            autoComplete="current-password"
                            onChange={(event) => setCurrent(event.target.value)}
                            disabled={busy}
                        />
                    </div>
                    <div className="settings-field">
                        <Label htmlFor="password-new">New password</Label>
                        <Input
                            id="password-new"
                            type={type}
                            value={next}
                            autoComplete="new-password"
                            onChange={(event) => setNext(event.target.value)}
                            disabled={busy}
                        />
                    </div>
                    <div className="settings-field">
                        <Label htmlFor="password-confirm">Confirm new password</Label>
                        <Input
                            id="password-confirm"
                            type={type}
                            value={confirm}
                            autoComplete="new-password"
                            onChange={(event) => setConfirm(event.target.value)}
                            disabled={busy}
                        />
                    </div>
                    <div className="sx-meter sx-span-2" aria-hidden="true">
                        <div className="sx-meter-bar">
                            <span
                                className={percent === 100 ? "is-full" : undefined}
                                style={{ width: `${percent}%` }}
                            />
                        </div>
                        <small>
                            {length >= MIN_PASSWORD_LENGTH
                                ? "Long enough"
                                : `${length} of ${MIN_PASSWORD_LENGTH} characters`}
                        </small>
                    </div>
                </div>
                <label className="settings-check">
                    <input
                        type="checkbox"
                        checked={show}
                        onChange={(event) => setShow(event.target.checked)}
                    />                        Show passwords
                </label>
                {error && (
                    <p role="alert" className="settings-message settings-message-error">
                        {error}
                    </p>
                )}
                {done && (
                    <p role="status" className="settings-message settings-message-ok">
                        Your password has been changed. Use the new one the next time you sign in.
                    </p>
                )}
                <div className="settings-actions">
                    <Button type="submit" disabled={busy}>
                        {busy ? "Changing…" : "Change password"}
                    </Button>
                </div>
            </form>
        </SettingsCard>
    );
}